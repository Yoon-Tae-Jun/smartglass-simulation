# 파일 위치: rag/rag_schemas.py
# 질문응답 데이터 양식

from pydantic import BaseModel, Field

class RagRequest(BaseModel):
    question: str = Field(description="사용자의 질문")

class RagSource(BaseModel):
    id: str = Field(description="문서 고유 번호")
    title: str = Field(description="장소명")
    location: str = Field(description="주소")
    content: str = Field(description="검색된 문서 원문")

class RagResponse(BaseModel):
    answer: str = Field(description="DB 검색을 바탕으로 생성된 AI의 답변")
    sources: list[RagSource] = Field(description="답변 생성에 참조한 검색 문서 목록")
