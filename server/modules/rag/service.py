import os

import requests

from schemas.base import BaseResponse
from schemas.rag import RagRequest, RagResponse
from utils.env import load_env
from utils.errors import catch_request_errors, success_response

# 환경변수 로드(server/.env)
load_env()
RAG_URL = os.environ["RAG_URL"]


"""
서울 관광지/맛집 질문을 별도 RAG 서버(RAG_API.md)에 위임해서 답을 받아오는 함수
PARAMS:
- request: 사용자의 질문

RETURN:
- BaseResponse[RagResponse]: status=200이면 data에 답변 + 참조 문서(최대 3개),
  실패하면 status/msg에 원인
"""
@catch_request_errors
def question_answering_rag(request: RagRequest) -> BaseResponse[RagResponse]:
    response = requests.post(f"{RAG_URL}/rag/qa", json={"question": request.question})
    response.raise_for_status()

    body = response.json()
    return success_response(RagResponse(answer=body["answer"], sources=body["sources"]))
