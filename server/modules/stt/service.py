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

# 환경변수 로드(server/.env)
load_env()

DEFAULT_TIMEOUT = 15.0  # 단발 인식에서 문장 확정을 기다리는 최대 시간(초)


class CommandSession:
    """
    실시간 오디오 -> 문장 인식 -> 명령어 판별을 스트리밍으로 처리하는 세션.

    feed()로 16kHz·모노·16bit PCM 청크를 넣으면 on_event 콜백으로
    BaseResponse[CommandEvent]가 전달된다.
    - partial: 인식 중인 중간 문장 (자막 갱신용)
    - final: 침묵으로 확정된 문장
    - wake: 확정 문장에서 명령어가 감지됨 (feature에 실행할 기능명)
    """

    """
    PARAMS:
    - on_event: 인식 결과를 받을 콜백 (BaseResponse[CommandEvent])
    - language: 인식 언어 (ko | en | ja)
    """
    def __init__(
        self,
        on_event: Callable[[BaseResponse[CommandEvent]], None],
        language: str = "ko",
    ) -> None:
        self.on_event = on_event
        self.language = language
        self._session: Optional[STTSession] = None

    """
    CLOVA Speech 스트리밍 세션을 여는 함수

    RETURN:
    - BaseResponse[None]: status=200이면 세션 시작 성공, 실패하면 status/msg에 원인
    """
    def start(self) -> BaseResponse[None]:
        secret = os.environ.get("CLOVA_SPEECH_SECRET")
        # 키가 설정되지 않은 경우 (modules/stt/.env 확인)
        if not secret:
            return error_response(500, "CLOVA Speech 환경변수가 설정되지 않았습니다")

        self._session = STTSession(
            secret, language=self.language, on_result=self._handle_result
        )
        self._session.start()
        return success_response(None)

    """
    오디오 청크를 세션에 밀어넣는 함수
    PARAMS:
    - pcm_chunk: 16kHz·모노·16bit PCM 바이트
    """
    def feed(self, pcm_chunk: bytes) -> None:
        if self._session is not None:
            self._session.feed(pcm_chunk)

    """세션을 닫는 함수 (남은 오디오 전송 종료)"""
    def close(self) -> None:
        if self._session is not None:
            self._session.close()
            self._session = None

    # STTSession의 인식 결과(partial/final)를 표준 이벤트로 변환해 콜백에 전달
    def _handle_result(self, result: dict) -> None:
        event_type = result["type"]
        text = result["text"]

        self._emit(CommandEvent(type=event_type, text=text))

        # 확정된 문장에서만 명령어를 판별 (중간 문장은 계속 바뀌므로 제외)
        if event_type == "final":
            feature = detect_feature(text)
            if feature:
                self._emit(CommandEvent(type="wake", text=text, feature=feature))

    # 콜백에서 예외가 나도 인식 스레드가 죽지 않도록 감싼다
    def _emit(self, event: CommandEvent) -> None:
        try:
            self.on_event(success_response(event))
        except Exception as exc:
            print("[STT] on_event error:", exc)


"""
인식된 문장에서 실행할 기능(명령어)을 판별하는 함수
PARAMS:
- text: 인식된 문장

RETURN:
- BaseResponse[CommandData]: status=200이면 data에 문장/기능,
  매칭되는 명령어가 없으면 data.feature는 None
"""
def detect_command(text: str) -> BaseResponse[CommandData]:
    text = text.strip()
    # 빈 문장인 경우
    if not text:
        return error_response(400, "인식할 문장이 비어 있습니다")

    # 키워드 스포팅으로 기능 판별 (translate | navigate | exchange | qa)
    return success_response(CommandData(text=text, feature=detect_feature(text)))


"""
음성 입력 -> 문장 인식 -> 명령어 판별을 한 번에 처리하는 함수 (단발 호출용)
문장이 확정되면 더 듣지 않고 바로 결과를 반환한다.
PARAMS:
- audio_chunks: 16kHz·모노·16bit PCM 청크를 순서대로 내보내는 이터러블
- language: 인식 언어 (ko | en | ja)
- timeout: 문장 확정을 기다리는 최대 시간(초)

RETURN:
- BaseResponse[CommandData]: status=200이면 data에 인식 문장/기능, 실패하면 status/msg에 원인
"""
def recognize_command(
    audio_chunks: Iterable[bytes],
    language: str = "ko",
    timeout: float = DEFAULT_TIMEOUT,
) -> BaseResponse[CommandData]:
    finalized = threading.Event()
    # 문장이 확정되기 전에 오디오가 끝나면 마지막 중간 문장을 결과로 사용
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
            # 문장이 확정됐거나 제한 시간을 넘기면 더 이상 듣지 않는다
            if finalized.is_set() or time.monotonic() >= deadline:
                break
            session.feed(chunk)
    finally:
        session.close()

    # 오디오를 다 넣은 뒤 남은 시간만큼 확정을 기다린다
    finalized.wait(max(0.0, deadline - time.monotonic()))

    text = latest["text"].strip()
    # 제한 시간 안에 아무 문장도 인식되지 않은 경우
    if not text:
        return error_response(404, "음성에서 문장을 인식하지 못했습니다")

    return success_response(CommandData(text=text, feature=detect_feature(text)))
