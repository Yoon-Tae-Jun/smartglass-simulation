# RAG 모듈
스마트 글래스의 서울 관광 가이드 지식 검색(RAG) 모듈입니다. 네이버 클라우드 Vector DB(pgvector)에 적재된 관광지/맛집 정보를 바탕으로 사용자의 질문에 답변을 생성합니다.
이 폴더 하나로 독립 실행되는 FastAPI 서버입니다 (다른 폴더에 의존하지 않음).

## 사전 준비

1. `cp .env.example .env` 후 값 채우기
   - `DB_*`: NCP pgvector Vector DB 접속 정보 (이미 클라우드에 데이터가 적재되어 있다면 생략 가능)
   - `LLM_API_URL`: 별도 llm 서버가 제공하는 REST API 주소 (예: `http://<llm 서버>:8000/llm/replies`).
     이 서버는 Ollama에 직접 붙지 않고 이 API를 통해서만 LLM을 호출한다
2. (최초 1회, DB가 비어있을 때만) `python build_rag_db.py`로 `seoul_travel_data.json`을 DB에 적재

검색 시 사용하는 임베딩 모델(`jhgan/ko-sroberta-multitask`)은 DB를 적재할 때 쓴 모델과
반드시 동일해야 한다 (다르면 벡터 검색이 깨진다).

## 호출 or 실행 방법

```bash
cd rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # 값 입력
uvicorn main:app --host 0.0.0.0 --port 8000
```

요청/응답 상세 스펙은 [API.md](API.md) 참고.

```jsonc
// POST http://<서버 주소>:8000/rag/qa
{ "question": "경복궁 휴무일이 언제야?" }

// 응답
{
  "answer": "매주 화요일은 정기 휴궁일입니다. 하지만 공휴일과 겹치면 개방하고, 다음 첫 비공휴일이 휴궁일이 됩니다.",
  "sources": [
    { "id": "seoul_001", "title": "경복궁", "location": "서울특별시 종로구 사직로 161", "content": "..." }
  ]
}
```

함수를 직접 호출할 수도 있습니다.
```python
from rag_service import question_answering_rag
from rag_schemas import RagRequest

res = question_answering_rag(RagRequest(question="경복궁 휴무일이 언제야?"))
```

## 필요 라이브러리
```text
fastapi
uvicorn[standard]
python-dotenv
pydantic
requests
langchain-huggingface
sentence-transformers
langchain-postgres
psycopg2-binary
pgvector
```

## 모듈 구조
```text
rag/
├── main.py               # FastAPI 서버 (POST /rag/qa, GET /health)
├── build_rag_db.py
├── rag_schemas.py
├── rag_service.py
├── seoul_travel_data.json
├── requirements.txt
├── .env.example
├── API.md                # /rag/qa 요청/응답 스펙
└── README.md
```

## 작성자
박찬영