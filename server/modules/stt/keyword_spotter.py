# 명령어 → 기능 매핑 (순서 중요: 구체적인 것 먼저, qa는 마지막 fallback)
KEYWORDS = {
    "translate": ["번역", "통역"],
    "navigate":  ["안내", "경로", "까지", "가는 길", "어떻게 가", "길 알려"],
    "exchange":  ["환율", "환전", "얼마", "가격", "원으로"],
    "qa":        ["알려줘", "뭐야", "궁금", "찾아", "설명", "질문"],
}

def detect_feature(text: str):
    """최종 문장에서 어느 기능을 실행할지 판단. 없으면 None."""
    for feature, kws in KEYWORDS.items():
        if any(k in text for k in kws):
            return feature
    return None