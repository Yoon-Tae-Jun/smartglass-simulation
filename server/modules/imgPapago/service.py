import base64
import binascii
import os

import requests

from schemas.base import BaseResponse
from schemas.imgpapago import ImageTranslationData, ImageTranslationRequest
from utils.env import load_env
from utils.errors import catch_request_errors, error_response, success_response

# 환경변수 로드(server/.env)
load_env()

DEFAULT_IMAGE_TYPE = "image/png"


"""
클라이언트가 보낸 base64 이미지를 파파고에 올릴 바이트로 변환하는 함수
PARAMS:
- image: base64 문자열. 브라우저 canvas.toDataURL()이 만드는
  "data:image/png;base64,..." 형태의 data URL도 그대로 받는다

RETURN:
- (이미지 바이트, MIME 타입). 해석할 수 없으면 ValueError를 던진다
"""
def decode_image(image: str) -> tuple[bytes, str]:
    mime_type = DEFAULT_IMAGE_TYPE

    # data URL이면 접두사에서 MIME 타입을 꺼내고 본문만 남긴다
    if image.strip().startswith("data:"):
        header, _, image = image.strip().partition(",")
        mime_type = header[len("data:") :].split(";")[0] or DEFAULT_IMAGE_TYPE

    # 줄바꿈이 섞인 base64도 받아주기 위해 공백을 모두 제거한다
    image = "".join(image.split())
    if not image:
        raise ValueError("이미지가 비어 있습니다")

    try:
        return base64.b64decode(image, validate=True), mime_type
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"base64 이미지를 해석할 수 없습니다: {exc}") from exc


"""
이미지 속 글자를 인식해 번역문을 얹은 이미지를 돌려주는 함수 (파파고 이미지 번역)
PARAMS:
- request: base64 이미지 + 원본/번역 언어

RETURN:
- BaseResponse[ImageTranslationData]: status=200이면 data에 번역 이미지/원문/번역문,
  실패하면 status/msg에 원인
"""
@catch_request_errors
def translate_image(request: ImageTranslationRequest) -> BaseResponse[ImageTranslationData]:
    url = os.environ.get("IMG_TRANSLATE_URL")
    client_id = os.environ.get("PAPAGO_CLIENT_ID")
    secret_key = os.environ.get("PAPAGO_SECRET_KEY")
    # 키가 없을 때 import 시점에 죽으면 서버 전체가 못 뜨므로 호출 시점에 알린다
    if not url or not client_id or not secret_key:
        return error_response(500, "파파고 이미지 번역 환경변수가 설정되지 않았습니다")

    try:
        image_bytes, mime_type = decode_image(request.image)
    except ValueError as exc:
        return error_response(400, str(exc))

    response = requests.post(
        url,
        headers={
            "x-ncp-apigw-api-key-id": client_id,
            "x-ncp-apigw-api-key": secret_key,
        },
        # 이미지는 multipart로 올린다 (source/target은 같은 폼의 일반 필드)
        data={"source": request.source, "target": request.target},
        files={"image": ("image", image_bytes, mime_type)},
    )
    response.raise_for_status()

    body = response.json()
    data = body.get("data") or {}
    # 응답 형식이 예상과 다른 경우
    if not data:
        return error_response(502, f"파파고 응답을 해석할 수 없습니다: {body}")

    source_text = data.get("sourceText") or ""
    # 이미지에 글자가 없거나 인식하지 못한 경우
    if not source_text.strip():
        return error_response(404, "이미지에서 번역할 글자를 찾지 못했습니다")

    translation = ImageTranslationData(
        rendered_image=data.get("renderedImage") or "",
        source_text=source_text,
        target_text=data.get("targetText") or "",
    )
    return success_response(translation)
