# 인식된 문장에서 "무엇을 할지"를 판정하는 곳.
# service.py는 이 판정 결과로 세션 모드만 바꾼다 (판정 로직은 여기 말고 두지 않는다)

# 명령어 → 기능 매핑 (순서 중요: 구체적인 것 먼저, qa는 마지막 fallback)
# 번역/통역은 여기 없다 — is_dialog_start()가 먼저 잡아 dialog 모드로 보낸다
KEYWORDS = {
    "navigate":  ["안내", "경로", "까지", "가는 길", "어떻게 가", "길 알려"],
    "exchange":  ["환율", "환전", "얼마", "가격", "원으로"],
    "qa":        ["알려줘", "뭐야", "궁금", "찾아", "설명", "질문"],
}

# 대화 번역(dialog) 모드 진입어. translate는 별도 핸들러 없이 dialog 모드가 곧 번역 기능이라
# KEYWORDS가 아니라 여기서 처리한다 (KEYWORDS에 넣으면 핸들러가 없어 501이 된다)
DIALOG_START_KEYWORDS = ("번역", "통역", "외국인", "외국어")

# dialog 모드 종료어. dialog 모드는 영어를 인식하므로 영어로 받는다
DIALOG_END_KEYWORDS = ("stop", "exit")


def detect_feature(text: str):
    """최종 문장에서 어느 기능을 실행할지 판단. 없으면 None."""
    for feature, kws in KEYWORDS.items():
        if any(k in text for k in kws):
            return feature
    return None


def is_dialog_start(text: str) -> bool:
    """'번역해줘', '외국인과 대화 번역해줘' 같은 대화 번역 시작 명령인지 판단."""
    t = text.replace(" ", "")
    return any(k in t for k in DIALOG_START_KEYWORDS)


def is_dialog_end(text: str) -> bool:
    """dialog 모드에서 'stop' / 'exit' 처럼 대화를 끝내는 말인지 판단."""
    t = text.lower()
    return any(k in t for k in DIALOG_END_KEYWORDS)
