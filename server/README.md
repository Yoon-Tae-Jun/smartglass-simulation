# server

FastAPI 기반 API 서버. 각 외부 API 연동 기능은 [modules](modules/README.md) 규칙에 따라 `modules/` 아래에 모듈 단위로 작성한다.

클라이언트에서 호출하는 방법은 [API.md](API.md) 참고.

## 실행 방법

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate  # windows는 .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # 키 입력 (windows는 copy)
uvicorn main:app --reload
```

## 환경변수

모든 모듈의 API 키/URL은 `server/.env` 한 파일에서 관리한다. 키 목록은 [`.env.example`](.env.example) 참고.
`service.py`에서는 `utils/env.py`의 `load_env()`를 호출해 읽는다 (`.env`는 커밋 금지).

```python
from utils.env import load_env

load_env()
API_KEY = os.environ["MY_API_KEY"]
```

## 추가 라이브러리 설치
각 모듈에서 추가 라이브러리 설치 시 /server/requirements.txt에 모듈명을 작성한다.

실행 후 http://localhost:8000/docs 에서 API 목록 확인 가능.
