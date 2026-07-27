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
  papago/
    __init__.py
    service.py
```

스키마를 모듈 폴더가 아닌 `server/schemas`에 따로 모아두는 이유는, map 모듈의 출력을 papago 모듈이 입력으로 받는 것처럼 모듈 간에 데이터를 주고받는 경우가 있기 때문이다. 스키마가 각자 모듈 안에 있으면 서로 import하다가 꼬이기 쉬운데, 한 곳에 모아두면 어느 모듈에서든 자유롭게 참조할 수 있다.

## 역할 분담

- **팀원**: `schemas/<모듈이름>.py`에 자기 기능의 입출력 데이터 형식을 Pydantic 모델로 정의하고, `modules/<모듈이름>/service.py`에 그 형식을 입출력으로 쓰는 로직만 작성한다. `service.py`의 각 함수는 `BaseResponse[T]`를 직접 반환한다 (아래 예외 처리 참고). FastAPI, 라우팅은 신경쓰지 않는다.
- **통합 담당**: `router.py`를 작성해서 `service.py` 함수의 반환값(`BaseResponse`)을 그대로 엔드포인트 응답으로 연결한다.

`main.py`는 `modules/` 하위 폴더를 자동으로 스캔해서 `router.py`의 `router`를 등록하므로, 새 모듈이 추가돼도 `main.py`를 수정할 필요가 없다.

## 공통 응답 포맷

모든 API는 [`schemas/base.py`](../schemas/base.py)의 `BaseResponse`로 감싼 형태로 응답한다. `status`, `msg`는 필수, `data`는 실패 시 `null`일 수 있다.

```python
class BaseResponse(BaseModel, Generic[T]):
    status: int
    msg: str
    data: Optional[T] = None
```

```json
{
  "status": 200,
  "msg": "success",
  "data": { "message": "pong" }
}
```

## 예외 처리

`service.py` 함수는 실패해도 예외를 `raise`하지 않고 `BaseResponse`를 반환한다. 그래야 다른 모듈이 이 함수를 직접 호출할 때도 예외 전파 없이 `.status`만 확인하면 되고, 서버 전체가 죽는 일도 없다. 공통 헬퍼는 [`utils/errors.py`](../utils/errors.py)에 모아뒀다.

```python
from utils.errors import catch_request_errors, error_response, success_response

@catch_request_errors  # requests 호출 중 네트워크 예외 -> 502 BaseResponse로 자동 변환
def search_place(query: str) -> BaseResponse[SearchResult]:
    response = requests.get(...)
    response.raise_for_status()

    if not response.json()["items"]:
        return error_response(404, f"장소를 찾을 수 없습니다: {query}")

    return success_response(SearchResult(...))
```

- `success_response(data)`: `status=200, msg="success"`인 `BaseResponse` 생성
- `error_response(status, msg)`: `data=None`인 실패 `BaseResponse` 생성 (예: 404=찾을 수 없음)
- `catch_request_errors`: 함수를 감싸서 `requests`의 네트워크/HTTP 예외를 502 `BaseResponse`로 변환하는 데코레이터
- 다른 모듈 함수를 호출할 때는 `result = other_service_fn(...)` 후 `result.status == 200`인지 확인하고 진행 (`modules/map/service.py`의 `get_directions`, `resolve_place` 참고)

## 작성 예시

`schemas/example.py`, `modules/example/`, `modules/map/` 참고.

```python
# schemas/map.py (팀원 작성)
from pydantic import BaseModel


class SearchResult(BaseModel):
    name: str
    address: str
```

```python
# modules/map/service.py (팀원 작성)
import requests

from schemas.base import BaseResponse
from schemas.map import SearchResult
from utils.errors import catch_request_errors, error_response, success_response


@catch_request_errors
def search_place(query: str) -> BaseResponse[SearchResult]:
    response = requests.get(...)
    response.raise_for_status()

    items = response.json()["items"]
    if not items:
        return error_response(404, f"장소를 찾을 수 없습니다: {query}")

    return success_response(SearchResult(name=items[0]["name"], address=items[0]["address"]))
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
    return search_place(query)
```

- `prefix`는 모듈 이름과 동일하게 (다른 모듈과 겹치지 않도록)
- 외부 API 호출(HTTP 요청 등)은 `service.py` 안에서 처리
- 공통으로 쓰는 유틸(스키마 아닌 함수 등)은 `server/utils`에 작성

## README 작성 방법

각 모듈 최상위 폴더(`modules/<모듈이름>/README.md`)에 아래 형식으로 작성한다. `modules/map/README.md` 참고.

```
# 모듈 명
모듈 개요

## 목차 (길면 추가)

## 호출 또는 실행 방법
```
호출 or 실행 방법 작성
```

## 필요 라이브러리
```
fastapi
opencv
```

## 모듈 구조
```
map/
├── map.py
├── driver.py
└── util.py
```

## 작성자
```
