# 파일 위치: rag/rag_schemas.py
# 질문응답 데이터 양식

from pydantic import BaseModel, Field

class RagRequest(BaseModel):
    question: str = Field(description="사용자의 질문")

class RagResponse(BaseModel):
    answer: str = Field(description="DB 검색을 바탕으로 생성된 AI의 답변")