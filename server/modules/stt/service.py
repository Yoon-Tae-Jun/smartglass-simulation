import os
import threading
import time
from typing import Callable, Iterable, Optional

from schemas.base import BaseResponse
from schemas.stt import CommandData, CommandEvent
from utils.env import load_env
from utils.errors import error_response, success_response

from .keyword_spotter import detect_feature
from .stt_session import STTSession

load_env()
DEFAULT_TIMEOUT = 15.0


def is_dialog_start(text: str) -> bool:
    """'외국인과 대화 번역해줘' 같은 대화 번역 시작 명령 판별"""
    t = text.replace(" ", "")
    if any(k in t for k in ("외국인", "외국어", "통역")):
        return True
    if "대화" in t and ("번역" in t or "통역" in t):
        return True
    return False


class CommandSession:
    """command 모드(한국어 명령) ↔ dialog 모드(영어 인식+한국어 번역) 전환 세션."""

    def __init__(self, on_event: Callable[[BaseResponse[CommandEvent]], None], language: str = "ko") -> None:
        self.on_event = on_event
        self.language = language
        self._session: Optional[STTSession] = None
        self._secret: Optional[str] = None
        self._mode = "command"

    def start(self) -> BaseResponse[None]:
        self._secret = os.environ.get("CLOVA_SPEECH_SECRET")
        if not self._secret:
            return error_response(500, "CLOVA Speech 환경변수가 설정되지 않았습니다")
        self._open("command", self.language, None)
        return success_response(None)

    def _open(self, mode: str, language: str, translate_to: Optional[str]) -> None:
        if self._session is not None:
            self._session.close()
        self._mode = mode
        self._session = STTSession(
            self._secret, language=language, translate_to=translate_to,
            on_result=self._handle_result,
        )
        self._session.start()

    def feed(self, pcm_chunk: bytes) -> None:
        if self._session is not None:
            self._session.feed(pcm_chunk)

    def close(self) -> None:
        if self._session is not None:
            self._session.close()
            self._session = None

    def _handle_result(self, result: dict) -> None:
        event_type = result["type"]
        text = result["text"]
        translated = result.get("translated", "")

        if self._mode == "command":
            self._emit(CommandEvent(type=event_type, text=text))
            if event_type != "final":
                return
            if is_dialog_start(text):                      # 대화 번역 모드 진입
                self._emit(CommandEvent(type="status", text="dialog"))
                self._open("dialog", "en", "ko")
                return
            feature = detect_feature(text)
            if feature:
                self._emit(CommandEvent(type="wake", text=text, feature=feature))
        else:                                              # dialog 모드: 영어→한국어 번역
            self._emit(CommandEvent(type=event_type, text=text, translated=translated))
            if event_type == "final":
                low = text.lower()
                if "stop" in low or "exit" in low:         # 대화 종료
                    self._emit(CommandEvent(type="status", text="command"))
                    self._open("command", self.language, None)

    def _emit(self, event: CommandEvent) -> None:
        try:
            self.on_event(success_response(event))
        except Exception as exc:
            print("[STT] on_event error:", exc)


def detect_command(text: str) -> BaseResponse[CommandData]:
    text = text.strip()
    if not text:
        return error_response(400, "인식할 문장이 비어 있습니다")
    return success_response(CommandData(text=text, feature=detect_feature(text)))


def recognize_command(audio_chunks: Iterable[bytes], language: str = "ko",
                      timeout: float = DEFAULT_TIMEOUT) -> BaseResponse[CommandData]:
    finalized = threading.Event()
    latest = {"text": ""}

    def on_event(response: BaseResponse[CommandEvent]) -> None:
        event = response.data
        if event.type == "partial":
            latest["text"] = event.text
        elif event.type == "final":
            latest["text"] = event.text
            finalized.set()

    session = CommandSession(on_event, language=language)
    start_result = session.start()
    if start_result.status != 200:
        return start_result

    deadline = time.monotonic() + timeout
    try:
        for chunk in audio_chunks:
            if finalized.is_set() or time.monotonic() >= deadline:
                break
            session.feed(chunk)
    finally:
        session.close()

    finalized.wait(max(0.0, deadline - time.monotonic()))
    text = latest["text"].strip()
    if not text:
        return error_response(404, "음성에서 문장을 인식하지 못했습니다")
    return success_response(CommandData(text=text, feature=detect_feature(text)))
