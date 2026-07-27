# 파일 위치: rag/llm_service.py
# 질문 응답 함수

import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_postgres.vectorstores import PGVector
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from schemas import RagRequest, RagResponse

# [TODO: API 키 및 DB 접속 정보 세팅]
os.environ["OPENAI_API_KEY"] = "여기에_발급받은_API_키를_입력하세요"

DB_USER = "DB_아이디"
DB_PASSWORD = "DB_비밀번호"
DB_HOST = "DB_접속주소"
DB_PORT = "5432"
DB_NAME = "DB_이름"
CONNECTION_STRING = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
COLLECTION_NAME = "seoul_travel_docs"

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

def question_answering_rag(req: RagRequest) -> RagResponse:
    """기능 C: 질문 응답 RAG"""
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
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