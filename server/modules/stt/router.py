import asyncio
import json
import threading
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from schemas.base import BaseResponse
from schemas.map import Coordinate
from schemas.stt import CommandData, CommandEvent
from service import handle_command
from utils.errors import success_response

from .service import CommandSession

router = APIRouter(prefix="/stt", tags=["stt"])

FLUSH_GRACE = 0.5  # 종료 요청 후 마지막 문장이 확정되기를 기다리는 시간(초)
EXECUTE_TIMEOUT = 10.0  # 종료 시 실행 중인 기능이 끝나기를 기다리는 최대 시간(초)
FRAME_TIMEOUT = 3.0  # capture 요청 후 카메라 프레임을 기다리는 최대 시간(초)


"""
실시간 음성 인식 WebSocket

입력:
- 바이너리 프레임 = 16kHz·모노·16bit PCM 청크
- 텍스트 프레임
  - {"action": "stop"} 종료 요청
  - {"action": "frame", "image": "<base64>"} capture 요청에 대한 응답
  - {"action": "wake"} 호출어를 건너뛰고 바로 명령 수신 상태로 (기능 버튼 클릭 등)
    {"action": "wake", "mode": "dialog"} 이면 대화 번역 모드로 바로 진입
  - {"action": "sleep"} 호출어 대기 상태로 복귀
쿼리:
- language: 인식 언어 (ko | en | ja)
- lat, lng: 현재 위치 좌표. 목적지만 말했을 때 길찾기 출발지로 사용된다
- execute: true면 명령어 감지 시 기능(map 등)까지 실행해서 결과를 함께 보냄
- wake_word: true면 호출어("헤이 글래스")를 들어야 명령을 받는다. false면 항상 듣는다
- listen_timeout: 호출어 뒤 명령을 받는 시간(초). 0 이하면 무제한
                  (기본값은 server/.env의 STT_LISTEN_TIMEOUT, 없으면 10초)

출력: 모두 BaseResponse JSON
- data.type이 있으면 인식 이벤트 (partial | final | wake | status | capture)
- data.mode에 현재 세션 상태 (idle | listening | dialog)
- data.feature가 있으면 기능 실행 결과 (CommandResult)
- capture는 "지금 화면을 찍어 보내달라"는 요청이다. 클라이언트는 곧바로
  {"action": "frame", "image": ...}로 답해야 이미지 번역이 진행된다
"""
@router.websocket("/ws")
async def stream(
    websocket: WebSocket,
    language: str = "ko",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    execute: bool = True,
    wake_word: bool = True,
    listen_timeout: Optional[float] = None,
):
    await websocket.accept()
    loop = asyncio.get_running_loop()
    running: list[threading.Thread] = []  # 실행 중인 기능 스레드
    # 둘 다 들어왔을 때만 현재 위치로 인정한다
    location = Coordinate(lat=lat, lng=lng) if lat is not None and lng is not None else None
    # 클라이언트가 보낸 마지막 카메라 프레임(base64)과 도착 신호
    frame: dict[str, Optional[str]] = {"image": None}
    frame_arrived = threading.Event()

    # 인식 콜백은 gRPC 스레드에서 오므로 이벤트 루프로 넘겨서 전송한다
    def send(payload: BaseResponse) -> None:
        asyncio.run_coroutine_threadsafe(
            websocket.send_text(payload.model_dump_json()), loop
        )

    """
    지금 이 순간의 화면을 클라이언트에 요청해서 받아오는 함수

    이미지 번역은 "명령을 말한 시점의 화면"으로 해야 하므로, 미리 받아둔 프레임을 쓰지 않고
    capture 이벤트를 보내 새로 찍게 한다. 수신 루프는 계속 돌고 있으므로 여기서 기다려도 된다.

    RETURN:
    - 새로 받은 프레임. 제한 시간 안에 오지 않으면 직전에 받아둔 프레임(그것도 없으면 None)
    """
    def request_frame() -> Optional[str]:
        frame_arrived.clear()
        send(success_response(CommandEvent(type="capture", text="")))
        frame_arrived.wait(FRAME_TIMEOUT)
        return frame["image"]

    def on_event(event_response: BaseResponse) -> None:
        send(event_response)

        event = event_response.data
        # 기능 실행은 wake 이벤트에서만 (partial/final/status는 실행 대상이 아니다)
        if not execute or event.type != "wake":
            return

        # 기능 실행(외부 API 호출)이 인식 스트림을 막지 않도록 별도 스레드에서 처리
        command = CommandData(text=event.text, feature=event.feature)

        def run() -> None:
            # 화면이 필요한 기능만 캡처를 요청한다
            image = request_frame() if command.feature == "image" else None
            send(handle_command(command, location=location, image=image))

        thread = threading.Thread(target=run, daemon=True)
        running.append(thread)
        thread.start()

    session = CommandSession(
        on_event,
        language=language,
        listen_timeout=listen_timeout,
        require_wake_word=wake_word,
    )
    start_result = session.start()
    # 세션을 열지 못한 경우(키 미설정 등) 원인을 알려주고 종료
    if start_result.status != 200:
        await websocket.send_text(start_result.model_dump_json())
        await websocket.close()
        return

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                session.feed(message["bytes"])
            elif message.get("text"):
                payload = json.loads(message["text"])
                action = payload.get("action")
                if action == "stop":
                    break
                # 화면 조작(기능 버튼)으로 호출어를 건너뛰고 명령 수신 상태로
                if action == "wake":
                    session.wake(payload.get("mode"))
                # 기능을 끈 경우 즉시 호출어 대기 상태로 되돌린다
                elif action == "sleep":
                    session.sleep()
                # capture 요청에 대한 응답(또는 클라이언트가 미리 보낸 프레임)
                elif action == "frame":
                    frame["image"] = payload.get("image")
                    frame_arrived.set()
    except WebSocketDisconnect:
        pass
    finally:
        session.close()
        # 종료 직전에 확정된 문장까지 처리한 뒤, 실행 중인 기능 결과를 보내고 닫는다
        await asyncio.sleep(FLUSH_GRACE)
        for thread in running:
            await asyncio.to_thread(thread.join, EXECUTE_TIMEOUT)
