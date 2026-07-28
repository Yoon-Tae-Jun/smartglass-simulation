# 파일 위치: rag/rag_service.py
# 질문 응답 함수

import os

import requests
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_postgres.vectorstores import PGVector
from rag_schemas import RagRequest, RagResponse, RagSource

# 1. .env 파일에 숨겨둔 정보들을 파이썬이 읽어오도록 실행합니다.
load_dotenv()

# 2. os.getenv()를 통해 .env 파일에서 실제 값을 가져와 변수에 담습니다.
# 코드를 보는 사람에겐 변수 이름만 보이고 실제 비밀번호는 보이지 않습니다!
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "seoul_travel_docs"

# LLM은 별도 llm 서버가 REST API로 감싸서 서비스 중이므로 Ollama에는 직접 붙지 않는다
LLM_API_URL = os.getenv("LLM_API_URL", "http://127.0.0.1:8000/llm/replies")

SYSTEM_PROMPT = (
    "너는 서울을 여행하는 외국인 관광객을 돕는 스마트 글래스 AI 가이드야.\n"
    "아래에 제공된 [검색된 문서 내용]을 최우선으로 참고하되, 정보가 부족하면 네 지식을 최대한 활용해 답변해."
)


def question_answering_rag(req: RagRequest) -> RagResponse:
    """기능 C: 질문 응답 RAG"""

    # 한국어 처리에 뛰어난 무료 오픈소스 로컬 임베딩 모델 사용
    embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")

    vectorstore = PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=CONNECTION_STRING,
        use_jsonb=True,
    )
    docs = vectorstore.similarity_search(req.question, k=3)
    context = "\n\n".join(doc.page_content for doc in docs)

    prompt = (
        f"{SYSTEM_PROMPT}\n\n[검색된 문서 내용]\n{context}\n\n[질문]\n{req.question}"
    )

    response = requests.post(LLM_API_URL, json={"context": prompt}, timeout=30)
    response.raise_for_status()

    # llm 서버는 실패해도 HTTP 200을 반환하고 본문의 status/data로 성공 여부를 알린다
    body = response.json()
    data = body.get("data") or {}
    answer = data.get("answer") or f"답변을 생성하지 못했습니다: {body.get('msg', '')}"

    sources = [
        RagSource(
            id=doc.metadata.get("id", ""),
            title=doc.metadata.get("title", ""),
            location=doc.metadata.get("location", ""),
            content=doc.page_content,
        )
        for doc in docs
    ]

    return RagResponse(answer=answer, sources=sources)
