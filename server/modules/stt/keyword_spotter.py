# 인식된 문장에서 "어느 기능을 실행할지"를 판정하는 곳.
# 대화 번역(dialog) 모드 진입/종료 판정은 service.py의 is_dialog_start()/_is_dialog_stop()에 있다.

# 명령어 → 기능 매핑 (순서 중요: 구체적인 것 먼저, qa는 마지막 fallback)
# 사람과의 대화 번역(통역)은 여기 없다 — service.py가 dialog 모드로 따로 보낸다
KEYWORDS = {
    "image":     ["메뉴판", "간판", "표지판", "이미지 번역", "사진 번역", "화면 번역"],
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
