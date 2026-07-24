# server

FastAPI 기반 API 서버. 각 외부 API 연동 기능은 [modules](modules/README.md) 규칙에 따라 `modules/` 아래에 모듈 단위로 작성한다.

## 실행 방법

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload
```

실행 후 http://localhost:8000/docs 에서 API 목록 확인 가능.
