# 모듈 작성 규칙

각 팀원은 담당하는 외부 API(네이버 맵, papago 등) 단위로 이 폴더 아래에 자신의 모듈 폴더를 만든다. 입출력 스키마는 [`server/schemas`](../schemas)에 모듈별 파일로 작성한다.

```
server/schemas/
  base.py      # 공통 응답 포맷 (BaseResponse)
  map.py       # map 모듈 입출력 스키마
  papago.py    # papago 모듈 입출력 스키마

server/modules/
  map/
    __init__.py
    service.py   # 팀원이 작성 (기능 로직)
    router.py    # 통합 담당(윤태준)이 작성 (엔드포인트 연결)
  papago/
    __init__.py
    service.py
    router.py
```

스키마를 모듈 폴더가 아닌 `server/schemas`에 따로 모아두는 이유는, map 모듈의 출력을 papago 모듈이 입력으로 받는 것처럼 모듈 간에 데이터를 주고받는 경우가 있기 때문이다. 스키마가 각자 모듈 안에 있으면 서로 import하다가 꼬이기 쉬운데, 한 곳에 모아두면 어느 모듈에서든 자유롭게 참조할 수 있다.

## 역할 분담

- **팀원**: `schemas/<모듈이름>.py`에 자기 기능의 입출력 데이터 형식을 Pydantic 모델로 정의하고, `modules/<모듈이름>/service.py`에 그 형식을 입출력으로 쓰는 로직만 작성한다. FastAPI, 라우팅은 신경쓰지 않는다.
- **통합 담당**: `router.py`를 작성해서 `service.py`를 엔드포인트로 연결하고, 모든 응답을 공통 포맷(`BaseResponse`)으로 감싼다.

`main.py`는 `modules/` 하위 폴더를 자동으로 스캔해서 `router.py`의 `router`를 등록하므로, 새 모듈이 추가돼도 `main.py`를 수정할 필요가 없다.

## 공통 응답 포맷

모든 API는 [`schemas/base.py`](../schemas/base.py)의 `BaseResponse`로 감싼 형태로 응답한다. `status`, `msg`, `data` 모두 필수값이다.(통합 담당)

```python
class BaseResponse(BaseModel, Generic[T]):
    status: int
    msg: str
    data: T
```

```json
{
  "status": 200,
  "msg": "success",
  "data": { "message": "pong" }
}
```

## 작성 예시

`schemas/example.py`, `modules/example/` 참고.

```python
# schemas/map.py (팀원 작성)
from pydantic import BaseModel


class SearchResult(BaseModel):
    name: str
    address: str
```

```python
# modules/map/service.py (팀원 작성)
from schemas.map import SearchResult


def search_place(query: str) -> SearchResult:
    ...
```

```python
# modules/map/router.py (통합 담당 작성)
from fastapi import APIRouter

from schemas.base import BaseResponse
from schemas.map import SearchResult

from .service import search_place

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/search", response_model=BaseResponse[SearchResult])
def search(query: str):
    return BaseResponse(status=200, msg="success", data=search_place(query))
```

- `prefix`는 모듈 이름과 동일하게 (다른 모듈과 겹치지 않도록)
- 외부 API 호출(HTTP 요청 등)은 `service.py` 안에서 처리
- 공통으로 쓰는 유틸(스키마 아닌 함수 등)은 `server/utils`에 작성
