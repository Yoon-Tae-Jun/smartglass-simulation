"""
호출어(웨이크워드) 감지 모듈.

"헤이 글래스"처럼 미리 정해둔 호출어가 인식된 문장에 들어오면,
호출어 뒤에 남은 말을 명령 문장으로 잘라서 돌려준다.

CLOVA Speech가 돌려준 텍스트만 보고 판별하므로 별도 라이브러리 설치가 필요 없다.
(음향 기반 웨이크워드 엔진과 달리 스트리밍은 계속 열려 있지만,
 idle 상태에서는 인식 결과를 프론트로 내보내지 않으므로 동작은 동일하다.)
"""

import os
import re

# STT가 호출어를 조금씩 다르게 받아쓰는 경우가 많아 오인식 변형까지 함께 등록한다.
# (아래 값들은 공백/문장부호를 제거한 "정규화된" 형태로 적는다)
DEFAULT_WAKE_WORDS = (
    "헤이글래스",
    "헤이글라스",
    "헤이그래스",
    "헤이그라스",
    "헤이클래스",
    "헤이클라스",
    "해이글래스",
    "해이글라스",
    "해이그래스",
    "hey글래스",
    "heyglass",
    "heyglasses",
)

# 명령 수신 상태에서 이 말을 하면 바로 대기 상태로 돌아간다 (타임아웃을 기다리지 않음)
DEFAULT_SLEEP_WORDS = (
    "고마워",
    "고맙습니다",
    "됐어",
    "됐습니다",
    "그만",
    "그만해",
    "종료",
    "끝",
)

# 공백과 문장부호는 비교 전에 제거한다 ("헤이 글래스," == "헤이글래스")
_SKIP = re.compile(r"[\s,.!?~…·\-'\"’“”]")


def _normalize(text: str):
    """
    비교용으로 정규화한 문자열과, 정규화 인덱스 -> 원본 인덱스 매핑을 함께 돌려준다.
    매핑이 있어야 호출어 뒤에 남은 "원본" 문장을 정확히 잘라낼 수 있다.
    """
    chars = []
    mapping = []
    for i, ch in enumerate(text):
        if _SKIP.match(ch):
            continue
        chars.append(ch.lower())
        mapping.append(i)
    return "".join(chars), mapping


def _load_wake_words():
    """
    호출어 목록을 정한다.
    server/.env 에 STT_WAKE_WORDS=헤이글래스,글래스야 처럼 적으면 그 값으로 교체된다.
    """
    raw = os.environ.get("STT_WAKE_WORDS", "")
    custom = [_normalize(w)[0] for w in raw.split(",") if w.strip()]
    if custom:
        return tuple(custom)
    return tuple(_normalize(w)[0] for w in DEFAULT_WAKE_WORDS)


WAKE_WORDS = _load_wake_words()


"""
문장에 호출어가 들어있는지 검사하는 함수

PARAMS:
- text: 인식된 문장 (중간/확정 문장 모두 가능)
- wake_words: 사용할 호출어 목록 (없으면 기본값)

RETURN:
- (감지 여부, 호출어 뒤에 남은 명령 문장)
  "헤이 글래스 환율 알려줘" -> (True, "환율 알려줘")
  "헤이 글래스"             -> (True, "")
  "오늘 날씨 좋네"           -> (False, "")
"""
def match_wake_word(text: str, wake_words=None):
    words = wake_words if wake_words is not None else WAKE_WORDS
    normalized, mapping = _normalize(text or "")
    if not normalized:
        return False, ""

    # 여러 번 불렸다면 가장 마지막 호출어를 기준으로 삼는다
    # ("헤이 글래스 아니 헤이 글래스 환율 알려줘" -> "환율 알려줘")
    last_end = -1
    for word in words:
        if not word:
            continue
        index = normalized.rfind(word)
        if index >= 0 and index + len(word) > last_end:
            last_end = index + len(word)

    # 호출어가 없는 경우
    if last_end < 0:
        return False, ""

    # 호출어가 문장 맨 끝이라 뒤에 남은 말이 없는 경우
    if last_end >= len(mapping):
        return True, ""

    return True, text[mapping[last_end]:].strip()


"""
대기 상태로 돌아가라는 말인지 판별하는 함수
PARAMS:
- text: 확정된 문장

RETURN:
- bool: True면 즉시 호출어 대기 상태로 복귀
"""
def is_sleep_word(text: str) -> bool:
    normalized, _ = _normalize(text or "")
    if not normalized:
        return False
    return normalized in tuple(_normalize(w)[0] for w in DEFAULT_SLEEP_WORDS)
