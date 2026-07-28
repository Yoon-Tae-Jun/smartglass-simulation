# 파일 위치: llm/base_schema.py
# 공통 응답 포맷 (server/schemas/base.py와 동일한 형태)

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class BaseResponse(BaseModel, Generic[T]):
    status: int
    msg: str
    data: Optional[T] = None
