# 파일 위치: rag/main.py
# RAG 단독 실행용 FastAPI 서버 (cd rag && uvicorn main:app)

from fastapi import FastAPI, HTTPException

from rag_schemas import RagRequest, RagResponse
from rag_service import question_answering_rag

app = FastAPI(title="Smart Glass RAG Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/rag/qa", response_model=RagResponse)
def qa(request: RagRequest):
    try:
        return question_answering_rag(request)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"RAG 응답 생성에 실패했습니다: {exc}")
