# 모듈 작성 규칙

각 팀원은 담당하는 외부 API(네이버 맵, 날씨 등) 단위로 이 폴더 아래에 자신의 모듈 폴더를 만든다.

```
server/modules/
  map/
    __init__.py
    schemas.py   # 팀원이 작성 (입출력 데이터 형식)
    service.py   # 팀원이 작성 (기능 로직)
    router.py    # 통합 담당(윤태준)이 작성 (엔드포인트 연결)
  papago/
    __init__.py
    schemas.py
    service.py
    router.py
```

## 역할 분담

- **팀원**: `schemas.py`에 자기 기능의 데이터 형식을 Pydantic 모델로 정의하고, `service.py`에 그 형식을 입출력으로 쓰는 로직만 작성한다. FastAPI, 라우팅은 신경쓰지 않는다.
- **통합 담당**: `router.py`를 작성해서 `service.py`를 엔드포인트로 연결하고, 모든 응답을 공통 포맷(`BaseResponse`)으로 감싼다.

`main.py`는 `modules/` 하위 폴더를 자동으로 스캔해서 `router.py`의 `router`를 등록하므로, 새 모듈이 추가돼도 `main.py`를 수정할 필요가 없다.

## 공통 응답 포맷

모든 API는 [`utils/schemas.py`](../utils/schemas.py)의 `BaseResponse`로 감싼 형태로 응답한다. `status`, `msg`, `data` 모두 필수값이다.

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

`modules/example/` 참고.

```python
# schemas.py (팀원 작성)
from pydantic import BaseModel


class SearchResult(BaseModel):
    name: str
    address: str
```

```python
# service.py (팀원 작성)
from .schemas import SearchResult


def search_place(query: str) -> SearchResult:
    ...
```

```python
# router.py (통합 담당 작성)
from fastapi import APIRouter

from utils.schemas import BaseResponse

from .schemas import SearchResult
from .service import search_place

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/search", response_model=BaseResponse[SearchResult])
def search(query: str):
    return BaseResponse(status=200, msg="success", data=search_place(query))
```

- `prefix`는 모듈 이름과 동일하게 (다른 모듈과 겹치지 않도록)
- 외부 API 호출(HTTP 요청 등)도 `service.py` 안에서 처리
- 공통으로 쓰는 유틸은 `server/utils`에 작성
