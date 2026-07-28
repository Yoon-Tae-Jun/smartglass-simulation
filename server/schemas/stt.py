from typing import Optional

from pydantic import BaseModel


class CommandData(BaseModel):
    text: str  # 인식된 문장
    feature: Optional[str] = None  # 감지된 기능 (navigate | exchange | qa), 없으면 None


class CommandEvent(BaseModel):
    type: str  # partial(중간 자막) | final(확정 문장) | wake(명령어 감지)
    text: str  # 현재까지 인식된 문장
    feature: Optional[str] = None  # type이 wake일 때 실행할 기능
    translated: Optional[str] = None   
