import os
import re

import requests

from schemas.base import BaseResponse
from schemas.map import (
    Coordinate,
    DirectionsData,
    DirectionsRequest,
    PlaceInfo,
    RouteGuide,
    RouteSection,
    RouteSummary,
)
from utils.env import load_env
from utils.errors import catch_request_errors, error_response, success_response

# 환경변수 로드(server/.env)
load_env()
GEOCODE_URL = os.environ["GEOCODE_URL"]
LOCAL_SEARCH_URL = os.environ["LOCAL_SEARCH_URL"]
DIRECTIONS_URL = os.environ["DIRECTIONS_URL"]

"""
도로명 주소를 좌표로 변환하는 함수
PARAMS:
- address: 변환할 도로명 주소 문자열

RETURN:
- BaseResponse[Coordinate]: status=200이면 data에 좌표, 실패하면 status/msg에 원인
"""
@catch_request_errors
def geocode(address: str) -> BaseResponse[Coordinate]:
    # 목적지 -> 좌표 변환
    response = requests.get(
        GEOCODE_URL,
        params={"query": address},
        headers={
            "x-ncp-apigw-api-key-id": os.environ["MAP_CLIENT_ID"],
            "x-ncp-apigw-api-key": os.environ["MAP_SECRET_KEY"],
            "Accept": "application/json",
        },
    )
    response.raise_for_status()

    addresses = response.json()["addresses"]
    # 주소를 찾을 수 없는 경우
    if not addresses:
        return error_response(404, f"주소를 찾을 수 없습니다: {address}")

    # 좌표 변환 결과에서 첫 번째 주소를 사용
    first = addresses[0]
    coordinate = Coordinate(lat=float(first["y"]), lng=float(first["x"]))
    return success_response(coordinate)


"""
상호명으로 장소를 검색해 도로명 주소를 출력하는 함수
PARAMS:
- query: 검색할 상호명/장소명 문자열

RETURN:
- BaseResponse[PlaceInfo]: status=200이면 data에 상호명/도로명 주소, 실패하면 status/msg에 원인
"""
@catch_request_errors
def search_place(query: str) -> BaseResponse[PlaceInfo]:
    response = requests.get(
        LOCAL_SEARCH_URL,
        params={"query": query, "display": 1},
        headers={
            "x-ncp-apigw-api-key-id": os.environ["LOCAL_SEARCH_CLIENT_ID"],
            "x-ncp-apigw-api-key": os.environ["LOCAL_SEARCH_SECRET_KEY"],
            "Accept": "application/json",
        },
    )
    response.raise_for_status()

    items = response.json()["items"]
    # 장소를 찾을 수 없는 경우
    if not items:
        return error_response(404, f"장소를 찾을 수 없습니다: {query}")

    # 검색 결과에서 첫 번째 장소를 사용
    first = items[0]
    place = PlaceInfo(
        name=re.sub(r"</?b>", "", first["title"]),
        road_address=first["roadAddress"],
    )
    return success_response(place)


"""
목적지 문자열(상호명 또는 도로명 주소)을 좌표로 변환하는 함수
PARAMS:
- query: 상호명 또는 도로명 주소 문자열

RETURN:
- BaseResponse[Coordinate]: status=200이면 data에 좌표, 실패하면 status/msg에 원인
"""
def resolve_destination(query: str) -> BaseResponse[Coordinate]:
    # 상호명으로 먼저 검색
    place_result = search_place(query)
    if place_result.status == 200:
        road_address = place_result.data.road_address
    else:
        # 검색 결과가 없으면 입력값 자체를 도로명 주소로 취급
        road_address = query

    return geocode(road_address)


"""
출발지, 목적지 사이의 경로를 계산하는 함수
PARAMS:
- request: 출발지(도로명 주소), 목적지(상호명 또는 도로명 주소)

RETURN:
- BaseResponse[DirectionsData]: status=200이면 data에 경로 정보, 실패하면 status/msg에 원인
"""
@catch_request_errors
def get_directions(request: DirectionsRequest) -> BaseResponse[DirectionsData]:
    origin_result = resolve_destination(request.origin)
    if origin_result.status != 200:
        return origin_result

    destination_result = resolve_destination(request.destination)
    if destination_result.status != 200:
        return destination_result

    origin_coord = origin_result.data
    destination_coord = destination_result.data

    response = requests.get(
        DIRECTIONS_URL,
        params={
            "start": f"{origin_coord.lng},{origin_coord.lat}",
            "goal": f"{destination_coord.lng},{destination_coord.lat}",
        },
        headers={
            "x-ncp-apigw-api-key-id": os.environ["MAP_CLIENT_ID"],
            "x-ncp-apigw-api-key": os.environ["MAP_SECRET_KEY"],
            "Accept": "application/json",
        },
    )
    response.raise_for_status()

    body = response.json()
    # 경로를 찾을 수 없는 경우
    if body["code"] != 0:
        return error_response(404, f"경로를 찾을 수 없습니다: {body['message']}")

    route = body["route"]["traoptimal"][0]
    summary = route["summary"]

    directions_data = DirectionsData(
        summary=RouteSummary(
            distance=summary["distance"],
            duration=summary["duration"],
            toll_fare=summary["tollFare"],
            taxi_fare=summary["taxiFare"],
            fuel_price=summary["fuelPrice"],
        ),
        path=[Coordinate(lng=point[0], lat=point[1]) for point in route["path"]],
        section=[
            RouteSection(
                point_index=section["pointIndex"],
                point_count=section["pointCount"],
                distance=section["distance"],
                name=section["name"],
                congestion=section["congestion"],
                speed=section["speed"],
            )
            for section in route["section"]
        ],
        guide=[
            RouteGuide(
                point_index=guide["pointIndex"],
                type=guide["type"],
                instructions=guide["instructions"],
                distance=guide["distance"],
                duration=guide["duration"],
            )
            for guide in route["guide"]
        ],
    )
    return success_response(directions_data)
