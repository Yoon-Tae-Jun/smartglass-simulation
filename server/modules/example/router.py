from fastapi import APIRouter

from utils.schemas import BaseResponse

from .schemas import PingData
from .service import get_ping_message

router = APIRouter(prefix="/example", tags=["example"])


@router.get("/ping", response_model=BaseResponse[PingData])
def ping():
    return BaseResponse(status=200, msg="success", data=get_ping_message())
