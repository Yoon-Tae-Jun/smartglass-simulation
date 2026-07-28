from fastapi import APIRouter

from schemas.base import BaseResponse
from schemas.rag import RagRequest, RagResponse

from .service import question_answering_rag

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/qa", response_model=BaseResponse[RagResponse])
def qa(request: RagRequest):
    return question_answering_rag(request)
