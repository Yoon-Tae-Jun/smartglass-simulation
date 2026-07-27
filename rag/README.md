# RAG 모듈
스마트 글래스의 서울 관광 가이드 지식 검색(RAG) 모듈입니다. 네이버 클라우드 Vector DB(pgvector)에 적재된 관광지/맛집 정보를 바탕으로 사용자의 질문에 답변을 생성합니다.

## 사전 준비 (DB 세팅)
이 모듈을 사용하기 전에 `build_rag_db.py`를 실행하여 클라우드 DB에 관광 데이터셋을 선행 적재해야 합니다.

## 호출 or 실행 방법
FastAPI 라우터에서 함수를 임포트하여 스키마 객체를 전달합니다.
```python
from rag.rag_service import question_answering_rag
from rag.rag_schemas import RagRequest

# 질문 응답 호출
res = question_answering_rag(RagRequest(question="경복궁 휴무일이 언제야?"))
```

## 필요 라이브러리
```text
langchain
langchain-openai
langchain-postgres
psycopg2-binary
pgvector
pydantic
```

## 모듈 구조
```text
rag/
├── build_rag_db.py
├── rag_schemas.py
├── rag_service.py
├── seoul_travel_data.json
└── README.md
```

## 작성자
박찬영