# map

지도 관련 기능 모듈. 상호명/도로명 주소를 좌표로 변환하고, 출발지-목적지 간 경로를 계산한다.

## 목차
- [호출 방법](#호출-방법)
- [필요 라이브러리](#필요-라이브러리)
- [모듈 구조](#모듈-구조)
- [출력 예시](#출력-예시)
- [작성자](#작성자)

## 호출 방법
```bash
cd server
python3 -m modules.map.test
```

```python
from modules.map.service import geocode, reverse_geocode, search_place, get_directions
from schemas.map import Coordinate, DirectionsRequest

search_place("순천향대 고기집")
geocode("충청남도 아산시 순천향로 22")
reverse_geocode(Coordinate(lat=37.5666103, lng=126.9783882))  # 좌표 -> 도로명 주소
get_directions(DirectionsRequest(origin="충청남도 아산시 순천향로 22", destination="순천향대 고기집"))
```

## 필요 라이브러리
```
requests
python-dotenv
```

## 모듈 구조
```
map/
├── README.md
├── router.py
├── service.py
└── test.py
```

환경변수(API 키/URL)는 [`server/.env`](../../.env.example)에서 공통으로 관리한다.

## 출력 예시

모든 응답은 공통 포맷 [`BaseResponse`](../../schemas/base.py)로 감싸서 나간다 (`status`, `msg`, `data`).

**search_place / geocode 결과 (좌표)**
```json
{
  "status": 200,
  "msg": "success",
  "data": {
    "lat": 36.7683778,
    "lng": 126.9289743
  }
}
```

**search_place 결과 (장소 정보)**
```json
{
  "status": 200,
  "msg": "success",
  "data": {
    "name": "한국갈비",
    "road_address": "충청남도 아산시 신창면 순천향로15번길 24 1층"
  }
}
```

**get_directions 결과 (경로)**
```json
{
  "status": 200,
  "msg": "success",
  "data": {
    "summary": {
      "distance": 1288,
      "duration": 212374,
      "toll_fare": 0,
      "taxi_fare": 4000,
      "fuel_price": 172
    },
    "path": [
      { "lat": 36.7683778, "lng": 126.9289743 },
      { "lat": 36.7684012, "lng": 126.9290011 }
    ],
    "section": [
      {
        "point_index": 0,
        "point_count": 48,
        "distance": 1288,
        "name": "순천향로",
        "congestion": 1,
        "speed": 32
      }
    ],
    "guide": [
      {
        "point_index": 0,
        "type": 3,
        "instructions": "우회전",
        "distance": 120,
        "duration": 15000
      }
    ]
  }
}
```

- `distance`: m, `duration`: ms, `toll_fare`/`taxi_fare`/`fuel_price`: 원
- `congestion`: 0=없음, 1=원활, 2=서행, 3=혼잡
- `type`: 분기점 타입 코드 (1=직진, 2=좌회전, 3=우회전, 6=유턴 등)

## 작성자
윤태준
