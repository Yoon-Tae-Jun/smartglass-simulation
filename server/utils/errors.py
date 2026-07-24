import functools

import requests

from schemas.base import BaseResponse


def error_response(status: int, msg: str) -> BaseResponse:
    return BaseResponse(status=status, msg=msg, data=None)


def success_response(data) -> BaseResponse:
    return BaseResponse(status=200, msg="success", data=data)


def catch_request_errors(func):
    """외부 API 호출 중 발생하는 네트워크/HTTP 예외를 잡아 502 BaseResponse로 변환한다."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except requests.exceptions.RequestException as exc:
            return error_response(502, f"외부 API 호출에 실패했습니다: {exc}")

    return wrapper
