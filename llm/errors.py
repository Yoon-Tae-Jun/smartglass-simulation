# 파일 위치: llm/errors.py
# 공통 에러 처리 유틸 (server/utils/errors.py와 동일한 형태)

from llm.base_schema import BaseResponse


def error_response(status: int, msg: str) -> BaseResponse:
    return BaseResponse(status=status, msg=msg, data=None)


def success_response(data) -> BaseResponse:
    return BaseResponse(status=200, msg="success", data=data)
