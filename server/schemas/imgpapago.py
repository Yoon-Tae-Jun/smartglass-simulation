from pydantic import BaseModel


class ImageTranslationRequest(BaseModel):
    image: str  # base64 이미지. "data:image/png;base64,..." 형태의 data URL도 허용
    source: str = "auto"  # 원본 언어 (auto면 파파고가 자동 판별)
    target: str = "ko"  # 번역할 언어


class ImageTranslationData(BaseModel):
    rendered_image: str  # 번역문을 얹어 다시 그린 이미지 (base64, 접두사 없음)
    source_text: str  # 이미지에서 인식된 원문
    target_text: str  # 번역된 문장
