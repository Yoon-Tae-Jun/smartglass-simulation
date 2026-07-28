# 파일 위치: llm/llm_router.py
# 답변 생성(LLM) 라우터

from fastapi import APIRouter

from llm.base_schema import BaseResponse
from llm.errors import error_response, success_response
from llm.llm_schemas import RepliesRequest, RepliesResponse
from llm.llm_service import generate_replies

router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/replies", response_model=BaseResponse[RepliesResponse])
def replies(req: RepliesRequest):
    try:
        return success_response(generate_replies(req))
    except Exception as exc:
        return error_response(502, f"답변 생성에 실패했습니다: {exc}")
