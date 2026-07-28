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
from .wake_word import is_sleep_word, match_wake_word

# 환경변수 로드(server/.env)
load_env()

DEFAULT_TIMEOUT = 15.0  # 단발 인식에서 문장 확정을 기다리는 최대 시간(초)

# 호출어 뒤 명령을 받는 시간(초). server/.env의 STT_LISTEN_TIMEOUT으로 조절,
# WebSocket 쿼리(listen_timeout)로 접속마다 다시 조절할 수 있다. 0 이하면 무제한.
DEFAULT_LISTEN_TIMEOUT = float(os.environ.get("STT_LISTEN_TIMEOUT", "10"))
WATCHDOG_INTERVAL = 0.3  # 타임아웃 감시 주기(초)

# 세션 상태
MODE_IDLE = "idle"            # 호출어를 기다리는 중 (인식 결과를 내보내지 않음)
MODE_LISTENING = "listening"  # 호출어를 들었고 명령을 받는 중
MODE_DIALOG = "dialog"        # 외국인과의 대화 번역 중 (타임아웃 없음)

DIALOG_STOP_WORDS = ("stop", "exit", "quit", "finish", "종료", "그만", "끝")


"""
대화 번역 모드로 들어가라는 말인지 판별하는 함수
PARAMS:
- text: 확정된 문장

RETURN:
- bool: True면 영어 인식 + 한국어 번역 모드로 전환
"""
def is_dialog_start(text: str) -> bool:
    compact = (text or "").replace(" ", "")
    if any(word in compact for word in ("외국인", "외국어", "통역")):
        return True
    return "대화" in compact and ("번역" in compact or "통역" in compact)


def _is_dialog_stop(text: str) -> bool:
    compact = (text or "").strip().strip(".!?,").lower()
    return compact in DIALOG_STOP_WORDS


class CommandSession:
    """
    실시간 오디오 -> 문장 인식 -> 명령어 판별을 스트리밍으로 처리하는 세션.

    feed()로 16kHz·모노·16bit PCM 청크를 넣으면 on_event 콜백으로
    BaseResponse[CommandEvent]가 전달된다.
    - partial: 인식 중인 중간 문장 (자막 갱신용)
    - final: 침묵으로 확정된 문장
    - wake: 확정 문장에서 명령어가 감지됨 (feature에 실행할 기능명)
    - status: 상태가 바뀜 (mode에 idle | listening | dialog)

    동작 흐름
    1) idle      : "헤이 글래스"를 들을 때까지 아무것도 내보내지 않는다
    2) listening : 명령을 받는다. listen_timeout초 동안 말이 없으면 idle로 복귀
    3) dialog    : "외국인과 대화할거야" 같은 말을 들으면 진입.
                   주고받는 대화라서 타임아웃 없이 유지되고, "stop"이라고 하면 종료
    """

    """
    PARAMS:
    - on_event: 인식 결과를 받을 콜백 (BaseResponse[CommandEvent])
    - language: 인식 언어 (ko | en | ja)
    - listen_timeout: 호출어 뒤 명령을 받는 시간(초). None이면 기본값, 0 이하면 무제한
    - require_wake_word: False면 호출어 없이 바로 명령을 받는다 (단발 호출·테스트용)
    """
    def __init__(
        self,
        on_event: Callable[[BaseResponse[CommandEvent]], None],
        language: str = "ko",
        listen_timeout: Optional[float] = None,
        require_wake_word: bool = True,
    ) -> None:
        self.on_event = on_event
        self.language = language
        self.listen_timeout = (
            DEFAULT_LISTEN_TIMEOUT if listen_timeout is None else float(listen_timeout)
        )
        self.require_wake_word = require_wake_word
        self._secret: Optional[str] = None
        self._session: Optional[STTSession] = None
        self._mode = MODE_IDLE if require_wake_word else MODE_LISTENING
        self._lock = threading.RLock()
        self._last_activity = 0.0
        self._stopped = threading.Event()

    """
    CLOVA Speech 스트리밍 세션을 여는 함수

    RETURN:
    - BaseResponse[None]: status=200이면 세션 시작 성공, 실패하면 status/msg에 원인
    """
    def start(self) -> BaseResponse[None]:
        secret = os.environ.get("CLOVA_SPEECH_SECRET")
        # 키가 설정되지 않은 경우 (server/.env 확인)
        if not secret:
            return error_response(500, "CLOVA Speech 환경변수가 설정되지 않았습니다")

        self._secret = secret
        self._open(self._mode, self.language, None)
        self._start_watchdog()
        return success_response(None)

    """
    오디오 청크를 세션에 밀어넣는 함수
    PARAMS:
    - pcm_chunk: 16kHz·모노·16bit PCM 바이트
    """
    def feed(self, pcm_chunk: bytes) -> None:
        with self._lock:
            session = self._session
        if session is not None:
            session.feed(pcm_chunk)

    """세션을 닫는 함수 (남은 오디오 전송 종료)"""
    def close(self) -> None:
        self._stopped.set()
        with self._lock:
            if self._session is not None:
                self._session.close()
                self._session = None

    """현재 상태를 돌려주는 함수 (idle | listening | dialog)"""
    @property
    def mode(self) -> str:
        return self._mode

    # 현재 상태에 맞는 STT 스트리밍 세션을 새로 연다 (언어·번역 설정이 바뀔 때 재접속)
    def _open(self, mode: str, language: str, translate_to: Optional[str]) -> None:
        with self._lock:
            if self._session is not None:
                self._session.close()

            self._mode = mode
            self._last_activity = time.monotonic()

            session = STTSession(self._secret, language=language, translate_to=translate_to)
            # 이전 세션의 뒤늦은 응답을 걸러내려고 결과에 세션 자신을 함께 넘긴다
            session.on_result = lambda result, owner=session: self._handle_result(result, owner)
            self._session = session
            session.start()

    # listening 상태에서 말이 없으면 idle로 되돌리는 감시 스레드
    def _start_watchdog(self) -> None:
        if not self.require_wake_word:
            return

        def run():
            while not self._stopped.wait(WATCHDOG_INTERVAL):
                if self._mode != MODE_LISTENING or self.listen_timeout <= 0:
                    continue
                if time.monotonic() - self._last_activity >= self.listen_timeout:
                    self._sleep("대기 상태로 돌아갑니다. 호출어를 불러 주세요")

        threading.Thread(target=run, daemon=True).start()

    # 호출어 대기 상태로 되돌린다
    def _sleep(self, message: str) -> None:
        if not self.require_wake_word:
            return
        with self._lock:
            if self._mode == MODE_IDLE:
                return
        self._emit(CommandEvent(type="status", text=message, mode=MODE_IDLE))
        self._open(MODE_IDLE, self.language, None)

    # STTSession의 인식 결과를 현재 상태에 맞게 처리한다
    def _handle_result(self, result: dict, owner: Optional[STTSession] = None) -> None:
        with self._lock:
            # 방금 닫은 세션에서 뒤늦게 올라온 결과는 버린다
            if owner is not None and owner is not self._session:
                return
            mode = self._mode

        event_type = result["type"]
        text = result["text"]
        translated = result.get("translated")

        if mode == MODE_IDLE:
            self._handle_idle(event_type, text)
        elif mode == MODE_DIALOG:
            self._handle_dialog(event_type, text, translated)
        else:
            self._handle_listening(event_type, text)

    # idle: 호출어만 찾는다. 호출어가 없으면 프론트로 아무것도 보내지 않는다
    def _handle_idle(self, event_type: str, text: str) -> None:
        detected, command = match_wake_word(text)
        if not detected:
            return

        with self._lock:
            self._mode = MODE_LISTENING
            self._last_activity = time.monotonic()
            session = self._session

        self._emit(CommandEvent(type="status", text="네, 듣고 있어요", mode=MODE_LISTENING))

        if event_type == "final":
            # "헤이 글래스, 환율 알려줘"처럼 한 문장으로 말한 경우 바로 실행한다
            if session is not None:
                session.reset_buffer("")
            if command:
                self._finalize(command)
            return

        # 아직 말하는 중이면 호출어는 버리고 뒤에 남은 말부터 이어서 누적한다
        if session is not None:
            session.reset_buffer(command)
        if command:
            self._emit(CommandEvent(type="partial", text=command, mode=MODE_LISTENING))

    # listening: 평소처럼 자막을 내보내고, 확정 문장에서 명령을 판별한다
    def _handle_listening(self, event_type: str, text: str) -> None:
        self._last_activity = time.monotonic()
        if event_type == "final":
            self._finalize(text)
        else:
            self._emit(CommandEvent(type="partial", text=text, mode=MODE_LISTENING))

    # dialog: 인식문 + 번역문을 함께 내보내고, 종료 명령이면 빠져나온다
    def _handle_dialog(self, event_type: str, text: str, translated: Optional[str]) -> None:
        self._last_activity = time.monotonic()
        self._emit(
            CommandEvent(type=event_type, text=text, translated=translated, mode=MODE_DIALOG)
        )

        if event_type == "final" and _is_dialog_stop(text):
            next_mode = MODE_IDLE if self.require_wake_word else MODE_LISTENING
            self._emit(
                CommandEvent(type="status", text="대화 번역을 종료합니다", mode=next_mode)
            )
            self._open(next_mode, self.language, None)

    # 확정된 문장 하나를 처리한다 (상태 전환 -> 명령어 판별)
    def _finalize(self, text: str) -> None:
        self._emit(CommandEvent(type="final", text=text, mode=MODE_LISTENING))

        # 대화 번역 모드로 전환 (영어 인식 + 한국어 번역으로 재접속)
        if is_dialog_start(text):
            self._emit(
                CommandEvent(
                    type="status",
                    text="대화 번역 모드로 전환합니다. 영어로 말씀해 주세요",
                    mode=MODE_DIALOG,
                )
            )
            self._open(MODE_DIALOG, "en", "ko")
            return

        # "고마워" 같은 말이면 타임아웃을 기다리지 않고 바로 대기 상태로
        if is_sleep_word(text):
            self._sleep("대기 상태로 돌아갑니다")
            return

        # 확정된 문장에서만 명령어를 판별 (중간 문장은 계속 바뀌므로 제외)
        feature = detect_feature(text)
        if feature:
            self._emit(
                CommandEvent(type="wake", text=text, feature=feature, mode=MODE_LISTENING)
            )

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
문장이 확정되면 더 듣지 않고 바로 결과를 반환한다. 호출어는 필요 없다.
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

    session = CommandSession(on_event, language=language, require_wake_word=False)
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
