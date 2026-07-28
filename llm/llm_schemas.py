# 파일 위치: llm/llm_schemas.py
# 길찾기, 통역, OCR 데이터 양식

from pydantic import BaseModel, Field

class RepliesRequest(BaseModel):
    context: str = Field(description="현재 대화 상황")

class RepliesResponse(BaseModel):
    answer: str = Field(description="상황/질문에 대한 답변")