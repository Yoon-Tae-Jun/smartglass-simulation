# RAG 모듈
스마트 글래스의 서울 관광 가이드 지식 검색(RAG) 모듈입니다. 네이버 클라우드 Vector DB(pgvector)에 적재된 관광지/맛집 정보를 바탕으로 사용자의 질문에 답변을 생성합니다.
이 폴더 하나로 독립 실행되는 FastAPI 서버입니다 (다른 폴더에 의존하지 않음).

## 사전 준비

1. `cp .env.example .env` 후 값 채우기
   - `DB_*`: NCP pgvector Vector DB 접속 정보 (이미 클라우드에 데이터가 적재되어 있다면 생략 가능)
   - `OLLAMA_BASE_URL`: LLM(Ollama, Qwen2.5)이 떠 있는 서버 주소. 이 서버와 다른 호스트일 수 있다
2. (최초 1회, DB가 비어있을 때만) `python build_rag_db.py`로 `seoul_travel_data.json`을 DB에 적재

## 호출 or 실행 방법

```bash
cd rag
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # 값 입력
uvicorn main:app --reload --port 8001
```

```jsonc
// POST http://localhost:8001/rag/qa
{ "question": "경복궁 휴무일이 언제야?" }

// 응답
{ "answer": "경복궁은 매주 화요일에 휴무입니다." }
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
langchain
langchain-classic
langchain-openai
langchain-huggingface
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
└── README.md
```

## 작성자
박찬영