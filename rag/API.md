# RAG API 문서

`rag/` 단독 FastAPI 서버가 제공하는 API 정리.

- Base URL: `http://<서버 주소>:8000`
- Swagger: `http://<서버 주소>:8000/docs`

## 목차
- [POST /rag/qa](#post-ragqa)
- [GET /health](#get-health)

---

## POST `/rag/qa`

서울 관광지/맛집 질문에 대해 pgvector DB에서 관련 문서를 검색(RAG)한 뒤, LLM 서버에 요청해 답변을 생성한다.

### 요청

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `/rag/qa` |
| Header | `Content-Type: application/json` |

**Body**

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `question` | string | O | 사용자의 질문 |

```json
{ "question": "경복궁 휴무일이 언제야?" }
```

### 응답 (200 OK)

| 필드 | 타입 | 설명 |
|---|---|---|
| `answer` | string | DB 검색 결과를 바탕으로 생성된 AI 답변 |
| `sources` | array | 답변 생성에 참조한 검색 문서 목록 (관련도 순 최대 3개) |
| `sources[].id` | string | 문서 고유 번호 |
| `sources[].title` | string | 장소명 |
| `sources[].location` | string | 주소 |
| `sources[].content` | string | 검색된 문서 원문 |

```json
{
  "answer": "매주 화요일은 정기 휴궁일입니다. 하지만 공휴일과 겹치면 개방하고, 다음 첫 비공휴일이 휴궁일이 됩니다.",
  "sources": [
    {
      "id": "seoul_001",
      "title": "경복궁",
      "location": "서울특별시 종로구 사직로 161",
      "content": "[관광지] 경복궁\n키워드: 경복궁, 고궁, 한복, ...\n내용: 경복궁은 조선 왕조의 법궁으로 ..."
    }
  ]
}
```

### 실패 (502)

pgvector DB 접속 실패, LLM 서버 호출 실패 등 내부 오류 발생 시 502와 함께 원인이 담긴다.

```json
{ "detail": "RAG 응답 생성에 실패했습니다: ..." }
```

### 예시

```bash
curl -X POST http://<서버 주소>:8000/rag/qa \
  -H "Content-Type: application/json" \
  -d '{"question": "경복궁 휴무일이 언제야?"}'
```

---

## GET `/health`

서버 상태 확인.

```json
{ "status": "ok" }
```
