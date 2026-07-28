from typing import Any, Optional

from pydantic import BaseModel

from schemas.map import Coordinate


class CommandContext(BaseModel):
    text: str  # 음성에서 인식된 문장
    location: Optional[Coordinate] = None  # 현재 위치 좌표, navigate에서 출발지로 사용
    image: Optional[str] = None  # 클라이언트가 보낸 카메라 프레임(base64), image에서 사용
    # 기능이 추가되면 여기에 필드를 늘린다


class CommandResult(BaseModel):
    feature: str  # 실행된 기능 (navigate | translate | exchange | qa ...)
    text: str  # 기능 실행의 근거가 된 인식 문장
    data: Any = None  # 기능별 실행 결과 (navigate -> DirectionsData)
