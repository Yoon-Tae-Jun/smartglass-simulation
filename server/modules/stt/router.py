import asyncio
import json
import threading
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from schemas.base import BaseResponse
from schemas.stt import CommandData
from service import handle_command

from .service import CommandSession

router = APIRouter(prefix="/stt", tags=["stt"])

FLUSH_GRACE = 0.5  # 종료 요청 후 마지막 문장이 확정되기를 기다리는 시간(초)
EXECUTE_TIMEOUT = 10.0  # 종료 시 실행 중인 기능이 끝나기를 기다리는 최대 시간(초)


"""
실시간 음성 인식 WebSocket

입력: 바이너리 프레임 = 16kHz·모노·16bit PCM 청크, 종료는 {"action": "stop"}
쿼리:
- language: 인식 언어 (ko | en | ja)
- origin: 현재 위치 (도로명 주소 또는 상호명), 길찾기 출발지로 사용
- execute: true면 명령어 감지 시 기능(map 등)까지 실행해서 결과를 함께 보냄

출력: 모두 BaseResponse JSON
- data.type이 있으면 인식 이벤트 (partial | final | wake)
- data.feature가 있으면 기능 실행 결과 (CommandResult)
"""
@router.websocket("/ws")
async def stream(
    websocket: WebSocket,
    language: str = "ko",
    origin: Optional[str] = None,
    execute: bool = True,
):
    await websocket.accept()
    loop = asyncio.get_running_loop()
    running: list[threading.Thread] = []  # 실행 중인 기능 스레드

    # 인식 콜백은 gRPC 스레드에서 오므로 이벤트 루프로 넘겨서 전송한다
    def send(payload: BaseResponse) -> None:
        asyncio.run_coroutine_threadsafe(
            websocket.send_text(payload.model_dump_json()), loop
        )

    def on_event(event_response: BaseResponse) -> None:
        send(event_response)

        event = event_response.data
        if not execute or event.type != "wake":
            return

        # 기능 실행(외부 API 호출)이 인식 스트림을 막지 않도록 별도 스레드에서 처리
        command = CommandData(text=event.text, feature=event.feature)
        thread = threading.Thread(
            target=lambda: send(handle_command(command, origin=origin)),
            daemon=True,
        )
        running.append(thread)
        thread.start()

    session = CommandSession(on_event, language=language)
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
                if json.loads(message["text"]).get("action") == "stop":
                    break
    except WebSocketDisconnect:
        pass
    finally:
        session.close()
        # 종료 직전에 확정된 문장까지 처리한 뒤, 실행 중인 기능 결과를 보내고 닫는다
        await asyncio.sleep(FLUSH_GRACE)
        for thread in running:
            await asyncio.to_thread(thread.join, EXECUTE_TIMEOUT)
