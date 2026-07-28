# LLM 서버
스마트 글래스의 일반 인공지능(AI) 처리 서버입니다. 상황별 답변 생성을 담당하며, 로컬에 띄운 Ollama(`qwen2.5`)를 호출합니다.

## 실행 방법

저장소 루트에서 실행합니다 (`llm.xxx` 형태로 임포트하므로 `llm/` 안에서 실행하면 안 됩니다).

```bash
python3 -m venv .venv
source .venv/bin/activate  # windows는 .venv\Scripts\activate
pip install -r llm/requirements.txt
uvicorn llm.main:app --reload
```

Ollama가 `http://127.0.0.1:11434`에서 `qwen2.5` 모델로 떠있어야 합니다.

실행 후 http://localhost:8000/docs 에서 API 목록 확인 가능.

## API

모든 응답은 공통 포맷 [`BaseResponse`](base_schema.py)로 감싸서 나간다 (`status`, `msg`, `data`).

### POST `/llm/replies`

현재 대화/상황을 주면 그에 대한 답변을 생성합니다.

```jsonc
// 요청
{ "context": "얼마예요?" }
// 응답
{ "status": 200, "msg": "success", "data": { "answer": "5000원입니다." } }
```

### GET `/health`

서버 상태 확인.

## 코드에서 직접 쓰는 방법

```python
from llm.llm_service import generate_replies
from llm.llm_schemas import RepliesRequest

res = generate_replies(RepliesRequest(context="얼마예요?"))
```

## 필요 라이브러리
```text
fastapi
uvicorn[standard]
langchain
langchain-openai
pydantic
```

## 모듈 구조
```text
llm/
├── main.py          # FastAPI 앱 진입점
├── base_schema.py   # 공통 응답 포맷 (BaseResponse)
├── errors.py         # success_response / error_response
├── llm_router.py       # POST /llm/replies
├── llm_schemas.py       # 요청/응답 데이터 양식
├── llm_service.py        # 답변 생성 함수 (Ollama 호출)
└── README.md
```

## 작성자
박찬영
