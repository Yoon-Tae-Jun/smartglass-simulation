# 파일 위치: rag/rag_service.py
# 질문 응답 함수

import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_postgres.vectorstores import PGVector
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from rag.rag_schemas import RagRequest, RagResponse

# 1. .env 파일에 숨겨둔 정보들을 파이썬이 읽어오도록 실행합니다.
load_dotenv()

# Ollama 연동 우회를 위한 가짜 키 (LangChain 구조상 필수)
os.environ["OPENAI_API_KEY"] = "ollama"

# 2. os.getenv()를 통해 .env 파일에서 실제 값을 가져와 변수에 담습니다.
# 코드를 보는 사람에겐 변수 이름만 보이고 실제 비밀번호는 보이지 않습니다!
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "seoul_travel_docs"

# LLM은 서버에 설치된 로컬 Ollama (Qwen2.5) 사용
llm = ChatOpenAI(
    model="qwen2.5",
    temperature=0,
    openai_api_base="http://127.0.0.1:11434/v1"
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