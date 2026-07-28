# 파일 위치: llm/main.py
# LLM 서버 진입점. 저장소 루트에서 `uvicorn llm.main:app --reload`로 실행한다.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from llm.llm_router import router as llm_router

app = FastAPI(title="Smart Glass LLM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(llm_router)
