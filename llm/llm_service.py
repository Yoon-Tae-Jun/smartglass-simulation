# 파일 위치: llm/llm_service.py
# 길찾기, 통역, OCR 함수

import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from llm.llm_schemas import (
    DestinationRequest, DestinationResponse,
    RepliesRequest, RepliesResponse,
    OcrRequest, OcrResponse
)

llm = ChatOpenAI(
    model="qwen2.5",
    temperature=0,
    openai_api_base="http://127.0.0.1:11434/v1",
    api_key="ollama",
)

def extract_destination(req: DestinationRequest) -> DestinationResponse:
    structured_llm = llm.with_structured_output(DestinationResponse, method="json_mode")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "너는 서울을 처음 방문한 외국인 관광객을 돕는 '스마트 글래스 길찾기 전담 AI 비서'야. \n"
                   "사용자의 발화 텍스트를 분석하여 최종적으로 이동하고자 하는 정확한 '도착 목적지'의 명칭만 추출해. 문맥상 목적지가 없으면 ' 알 수 없음'으로 반환해.\n"
                   "반드시 JSON 형식으로, 'destination' 키의 값으로 목적지 이름만 출력해."),
        ("user", "{text}")
    ])
    chain = prompt | structured_llm
    return chain.invoke({"text": req.text})

def generate_replies(req: RepliesRequest) -> RepliesResponse:
    structured_llm = llm.with_structured_output(RepliesResponse, method="json_mode")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "너는 서울을 여행하는 외국인 관광객의 원활한 소통을 돕는 '스마트 글래스 실시간 통역 비서'야.\n"
                   "주어진 대화 상황을 분석하여, 사용자가 화면을 보고 터치할 수 있는 답변 3개를 [수락/긍정], [거절/부정], [추가 질문] 형태로  생성해.\n"
                   "각 답변은 15자를 넘지 않도록 간결하게 작성해. 반드시 JSON 형식으로 'replies' 키에 배열로 출력해."),
        ("user", "현재 대화/상황: {context}")
    ])
    chain = prompt | structured_llm
    return chain.invoke({"context": req.context})

def parse_menu_ocr(req: OcrRequest) -> OcrResponse:
    structured_llm = llm.with_structured_output(OcrResponse, method="json_mode")
    system_prompt = (
        "너는 스마트 글래스의 메뉴판 가격 인식 AI야.\n"
        "카메라 OCR이 읽어온 엉망진창인 텍스트에서 '메뉴 이름'과 '가격'만 정확히 추출해내야 해.\n"
        "가격은 쉼표(,)나 '원' 글자를 모두 제거하고 오직 정수(int) 형태의 숫자만 추출해.\n"
        "메뉴가 여러 개라면 배열 형태로 모두 추출하고, 전화번호나 주소 같은 불필요한 정보는 무시해.\n"
        "반드시 JSON 형식으로, 'items' 키에 배열로 출력해."
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", "OCR 인식 텍스트:\n{text}")
    ])
    chain = prompt | structured_llm
    return chain.invoke({"text": req.text})