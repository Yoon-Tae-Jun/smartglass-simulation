# LLM 모듈
스마트 글래스의 일반 인공지능(AI) 처리 모듈입니다. 길찾기 목적지 추출, 상황별 예상 답변 생성, 메뉴판 OCR 텍스트 파싱을 담당합니다.

## 호출 or 실행 방법
FastAPI 라우터에서 각 함수를 임포트하여 스키마 객체를 전달합니다.
```python
from llm.llm_service import extract_destination, generate_replies, parse_menu_ocr
from llm.llm_schemas import DestinationRequest, RepliesRequest, OcrRequest

# 길찾기 호출
res = extract_destination(DestinationRequest(text="명동 가자"))

# 답변 생성 호출
res = generate_replies(RepliesRequest(context="얼마예요?"))

# OCR 파싱 호출
res = parse_menu_ocr(OcrRequest(text="국밥 10000원"))
```

## 필요 라이브러리
```text
langchain
langchain-openai
pydantic
```

## 모듈 구조
```text
llm/
├── llm_schemas.py
├── llm_service.py
└── README.md
```

## 작성자
박찬영
