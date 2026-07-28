# 파일 위치: llm/llm_service.py
# 길찾기, 통역, OCR 함수

import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from llm.llm_schemas import (
    RepliesRequest, RepliesResponse
)

llm = ChatOpenAI(
    model="qwen2.5",
    temperature=0,
    openai_api_base="http://127.0.0.1:11434/v1",
    api_key="ollama",
)


def generate_replies(req: RepliesRequest) -> RepliesResponse:
    structured_llm = llm.with_structured_output(RepliesResponse, method="json_mode")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "너는 서울을 여행하는 외국인 관광객의 원활한 소통을 돕는 '스마트 글래스 실시간 통역 비서'야.\n"
                   "주어진 대화 상황에 대해 자연스럽고 간결하게 답변해. 반드시 JSON 형식으로 'answer' 키에 문자열로 출력해."),
        ("user", "현재 대화/상황: {context}")
    ])
    chain = prompt | structured_llm
    return chain.invoke({"context": req.context})