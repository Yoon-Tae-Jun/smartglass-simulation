# 파일 위치: llm/llm_schemas.py
# 길찾기, 통역, OCR 데이터 양식

from pydantic import BaseModel, Field

class DestinationRequest(BaseModel):
    text: str = Field(description="사용자의 STT 음성 텍스트")

class DestinationResponse(BaseModel):
    destination: str = Field(description="추출된 최종 목적지 이름")

class RepliesRequest(BaseModel):
    context: str = Field(description="현재 대화 상황")

class RepliesResponse(BaseModel):
    replies: list[str] = Field(description="상황에 맞는 짧은 대답 3개")

class OcrRequest(BaseModel):
    text: str = Field(description="메뉴판에서 읽어온 원본 OCR 텍스트")

class MenuItem(BaseModel):
    name: str = Field(description="추출된 메뉴 이름")
    price: int = Field(description="추출된 가격 (원 단위, 숫자만 포함)")

class OcrResponse(BaseModel):
    items: list[MenuItem] = Field(description="추출된 메뉴와 가격 리스트")