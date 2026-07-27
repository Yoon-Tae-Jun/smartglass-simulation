from pydantic import BaseModel


class Coordinate(BaseModel):
    lat: float
    lng: float


class PlaceInfo(BaseModel):
    name: str  # 상호명
    road_address: str  # 도로명 주소


class AddressInfo(BaseModel):
    road_address: str  # 도로명 주소


class DirectionsRequest(BaseModel):
    origin: str  # 출발지 도로명 주소
    destination: str  # 목적지 (상호명 또는 도로명 주소)


class RouteSummary(BaseModel):
    distance: int  # 총 거리 (m)
    duration: int  # 총 소요시간 (ms)
    toll_fare: int  # 통행 요금 (원)
    taxi_fare: int  # 예상 택시 요금 (원)
    fuel_price: int  # 예상 유류비 (원)


class RouteSection(BaseModel):
    point_index: int  # path 상의 시작 인덱스
    point_count: int  # 구간에 포함된 좌표 개수
    distance: int  # 구간 거리 (m)
    name: str  # 도로 이름
    congestion: int  # 혼잡도 (0: 없음, 1: 원활, 2: 서행, 3: 혼잡)
    speed: int  # 평균 속도 (km/h)


class RouteGuide(BaseModel):
    point_index: int  # path 상의 분기점 인덱스
    type: int  # 분기점 타입 코드 (1: 직진, 2: 좌회전, 3: 우회전, 6: 유턴 등)
    instructions: str  # 경로 안내 문구
    distance: int  # 이전 분기점부터의 거리 (m)
    duration: int  # 이전 분기점부터의 소요시간 (ms)


class DirectionsData(BaseModel):
    summary: RouteSummary
    path: list[Coordinate]
    section: list[RouteSection]
    guide: list[RouteGuide]
