from fastapi import APIRouter

from schemas.base import BaseResponse
from schemas.imgpapago import ImageTranslationData, ImageTranslationRequest

from .service import translate_image

router = APIRouter(prefix="/imgPapago", tags=["imgPapago"])


@router.post("/image", response_model=BaseResponse[ImageTranslationData])
def translate(request: ImageTranslationRequest):
    return translate_image(request)
