# 파일 위치: rag/rag_service.py
# 질문 응답 함수

import os
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings  # 🚨 오픈소스 임베딩 라이브러리로 변경
from langchain_core.prompts import ChatPromptTemplate
from langchain_postgres.vectorstores import PGVector
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from schemas import RagRequest, RagResponse

# Ollama 연동 우회를 위한 가짜 키 (LangChain 구조상 비워둘 수 없어 더미값 유지)
os.environ["OPENAI_API_KEY"] = "ollama"

# DB 접속 정보 세팅 (수정 완료)
DB_USER = "dauser"
DB_PASSWORD = "db1234!!"
DB_HOST = "10.0.2.9"
DB_PORT = "5432"
DB_NAME = "soboro_db"
CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "seoul_travel_docs"

# LLM은 로컬 Ollama (Qwen2.5) 사용
llm = ChatOpenAI(
    model="qwen2.5",
    temperature=0,
    openai_api_base="http://10.0.2.6:11434/v1"
)


def question_answering_rag(req: RagRequest) -> RagResponse:
    """기능 C: 질문 응답 RAG"""

    embeddings = HuggingFaceEmbeddings(model_name="jhgan/ko-sroberta-multitask")

    vectorstore = PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=CONNECTION_STRING,
        use_jsonb=True,
    )
    retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

    system_prompt = (
        "너는 서울을 여행하는 외국인 관광객을 돕는 스마트 글래스 AI 가이드야.\n"
        "아래에 제공된 [검색된 문서 내용]을 최우선으로 참고하되, 정보가 부족하면 네 지식을 최대한 활용해 답변해.\n\n"
        "[검색된 문서 내용]\n{context}"
    )
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}")
    ])

    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    rag_chain = create_retrieval_chain(retriever, question_answer_chain)

    result = rag_chain.invoke({"input": req.question})
    return RagResponse(answer=result["answer"])