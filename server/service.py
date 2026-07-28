"""
stt 모듈이 인식한 명령어를 기능 모듈(map 등)로 연결하는 통합 서비스.

    modules/stt (음성 -> 문장 -> 명령어) -> 이 파일에서 기능 라우팅 -> modules/map 실행

음성 인식 자체는 modules/stt/service.py가 담당하므로 여기서는 그 결과만 받아 쓴다.

기능 추가 방법:
1. modules/stt/keyword_spotter.py의 KEYWORDS에 기능 이름과 키워드를 등록한다.
2. 이 파일에 @feature("기능이름") 핸들러를 추가하고 BaseResponse를 반환한다.
handle_command()가 등록된 핸들러를 자동으로 찾아 실행하므로 다른 코드는 수정할 필요가 없다.
"""

import re
from typing import Callable, Dict, Optional, Union

from modules.imgPapago.service import translate_image
from modules.map.service import get_directions, reverse_geocode
from modules.rag.service import question_answering_rag
from modules.stt.service import detect_command
from schemas.base import BaseResponse
from schemas.command import CommandContext, CommandResult
from schemas.imgpapago import ImageTranslationRequest
from schemas.map import Coordinate, DirectionsRequest
from schemas.rag import RagRequest
from schemas.stt import CommandData
from utils.errors import error_response, success_response

# 기능 이름 -> 핸들러 (feature 데코레이터로 채워진다)
FEATURE_HANDLERS: Dict[str, Callable[[CommandContext], BaseResponse]] = {}


"""
기능 핸들러를 등록하는 데코레이터
PARAMS:
- name: keyword_spotter.KEYWORDS의 기능 이름과 동일한 값
"""
def feature(name: str):
    def register(handler: Callable[[CommandContext], BaseResponse]):
        FEATURE_HANDLERS[name] = handler
        return handler

    return register


# ---------------------------------------------------------------- navigate --

# 문장에서 출발지/목적지를 뽑는 패턴 (출발지가 있는 패턴을 먼저 시도)
ROUTE_PATTERNS = [
    r"(?P<origin>.+?)에서\s*(?P<destination>.+?)(?:까지|으로|로)(?=\s|$|[.,?!])",
    r"(?P<origin>.+?)에서\s*(?P<destination>.+?)\s*(?:가는 길|어떻게 가|안내|경로)",
    r"(?P<destination>.+?)(?:까지|으로|로)(?=\s|$|[.,?!])",
    r"(?P<destination>.+?)\s*(?:가는 길|어떻게 가|안내|경로)",
]

# 지명 앞에 붙어 의미가 없는 말
FILLER_PREFIXES = ("지금", "나", "저", "우리", "야", "여기서", "현재 위치", "현재위치")


"""
문장에서 출발지/목적지를 추출하는 함수
PARAMS:
- text: 인식된 문장 (예: "강남역에서 경복궁까지 가는 길 알려줘")

RETURN:
- (출발지, 목적지): 찾지 못한 값은 None
"""
def extract_places(text: str) -> tuple[Optional[str], Optional[str]]:
    for pattern in ROUTE_PATTERNS:
        match = re.search(pattern, text)
        if not match:
            continue

        groups = match.groupdict()
        origin = clean_place(groups.get("origin"))
        destination = clean_place(groups.get("destination"))
        if destination:
            return origin, destination

    return None, None


"""
추출한 지명에서 군더더기를 정리하는 함수
PARAMS:
- place: 정규식으로 뽑은 지명 조각

RETURN:
- 정리된 지명, 남는 게 없으면 None
"""
def clean_place(place: Optional[str]) -> Optional[str]:
    if not place:
        return None

    place = place.strip()
    # 문장 앞쪽 군더더기 제거 ("지금 강남역" -> "강남역")
    for filler in FILLER_PREFIXES:
        if place.startswith(filler):
            place = place[len(filler) :].strip()

    return place or None


"""
길찾기 기능: 문장에서 출발지/목적지를 뽑아 네이버 지도 경로를 조회하는 함수

출발지는 두 가지 시나리오로 나뉜다.
1. 문장에 출발지가 있는 경우 ("강남역에서 경복궁까지") -> 말한 지명을 도로명 주소로 변환해서 사용
2. 목적지만 말한 경우 ("경복궁까지 안내해줘") -> 클라이언트가 보낸 현재 위치 좌표를 도로명 주소로 변환해서 사용

PARAMS:
- context: 인식 문장 + 현재 위치 좌표

RETURN:
- BaseResponse[DirectionsData]: status=200이면 data에 경로 정보, 실패하면 status/msg에 원인
"""
@feature("navigate")
def navigate(context: CommandContext) -> BaseResponse:
    spoken_origin, destination = extract_places(context.text)
    # 목적지를 알아듣지 못한 경우
    if not destination:
        return error_response(400, f"목적지를 알아듣지 못했습니다: {context.text}")

    origin_result = resolve_origin(spoken_origin, context.location)
    if origin_result.status != 200:
        return origin_result

    return get_directions(
        DirectionsRequest(origin=origin_result.data, destination=destination)
    )


"""
길찾기 출발지를 get_directions에 넘길 문자열로 확정하는 함수
PARAMS:
- spoken_origin: 문장에서 뽑은 출발지 지명, 없으면 None
- location: 클라이언트가 보낸 현재 위치 좌표, 없으면 None

RETURN:
- BaseResponse[str]: status=200이면 data에 상호명 또는 도로명 주소, 실패하면 status/msg에 원인
"""
def resolve_origin(
    spoken_origin: Optional[str], location: Optional[Coordinate]
) -> BaseResponse[str]:
    # 시나리오 1: 문장에 출발지가 있으면 말한 지명을 그대로 넘긴다
    # (상호명/도로명 주소 판별은 get_directions 안의 resolve_place가 처리한다.
    #  여기서 미리 주소로 바꾸면 그 주소로 상호명이 재검색되어 엉뚱한 이름이 붙는다)
    if spoken_origin:
        return success_response(spoken_origin)

    # 시나리오 2: 목적지만 말했으면 현재 위치 좌표를 도로명 주소로 변환해서 쓴다
    if location:
        address_result = reverse_geocode(location)
        if address_result.status != 200:
            return address_result
        return success_response(address_result.data.road_address)

    return error_response(400, "출발지를 알 수 없습니다. 현재 위치 좌표를 함께 전달해주세요")


# ------------------------------------------------------------------- image --

"""
이미지 번역 기능: 클라이언트가 보낸 카메라 프레임의 글자를 번역하는 함수

음성에는 이미지가 없으므로, 명령이 잡힌 순간 stt 라우터가 클라이언트에 capture를 요청해
받아온 프레임을 넘겨준다. 그 요청에 응답이 없으면 이미지 없이 들어온다.

PARAMS:
- context: 인식 문장 + 카메라 프레임(base64)

RETURN:
- BaseResponse[ImageTranslationData]: status=200이면 data에 번역 이미지/원문/번역문,
  실패하면 status/msg에 원인
"""
@feature("image")
def image_translate(context: CommandContext) -> BaseResponse:
    # capture 요청에 클라이언트가 응답하지 않은 경우
    if not context.image:
        return error_response(
            400, '카메라 화면을 받지 못했습니다. capture 요청에 {"action": "frame"}으로 응답해주세요'
        )

    return translate_image(ImageTranslationRequest(image=context.image))


# ----------------------------------------------------------------------- qa --

"""
질문 응답 기능: 인식된 문장을 그대로 RAG 서버에 넘겨 답을 받아오는 함수

PARAMS:
- context: 인식 문장 (질문)

RETURN:
- BaseResponse[RagResponse]: status=200이면 data에 답변 + 참조 문서,
  실패하면 status/msg에 원인 (RAG 서버 호출 실패 시 502)
"""
@feature("qa")
def qa(context: CommandContext) -> BaseResponse:
    return question_answering_rag(RagRequest(question=context.text))


# ---------------------------------------------------------------- dispatch --

"""
stt가 인식한 명령어를 담당 기능 핸들러로 넘겨 실행하는 함수
PARAMS:
- command: stt의 인식 결과(CommandData), 또는 인식된 문장(str)
  - CommandData: WebSocket wake 이벤트처럼 기능까지 판별된 경우 그대로 전달
  - str: 문장만 있는 경우, stt의 detect_command로 기능을 판별한 뒤 실행
- location: 클라이언트가 보낸 현재 위치 좌표, 길찾기에서 출발지로 사용
- image: 클라이언트가 보낸 카메라 프레임(base64), 이미지 번역에서 사용

RETURN:
- BaseResponse[CommandResult]: status=200이면 data에 실행한 기능/결과, 실패하면 status/msg에 원인
"""
def handle_command(
    command: Union[CommandData, str],
    location: Optional[Coordinate] = None,
    image: Optional[str] = None,
) -> BaseResponse[CommandResult]:
    # 문장만 넘어온 경우 기능 판별은 stt 모듈에 맡긴다
    if isinstance(command, str):
        command_result = detect_command(command)
        if command_result.status != 200:
            return command_result
        command = command_result.data

    # 문장에서 실행할 기능을 찾지 못한 경우
    if command.feature is None:
        return error_response(404, f"실행할 기능을 찾지 못했습니다: {command.text}")

    handler = FEATURE_HANDLERS.get(command.feature)
    # 키워드는 잡혔지만 아직 핸들러가 없는 기능인 경우 (translate, exchange, qa ...)
    if handler is None:
        return error_response(501, f"아직 지원하지 않는 기능입니다: {command.feature}")

    handler_result = handler(
        CommandContext(text=command.text, location=location, image=image)
    )
    if handler_result.status != 200:
        return handler_result

    return success_response(
        CommandResult(
            feature=command.feature, text=command.text, data=handler_result.data
        )
    )
