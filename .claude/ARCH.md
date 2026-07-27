# 기능

- 실시간 대화 번역(CLOVA SPEECH 스트리밍 인식)
    - 예상 답변 N개 띄우기
- 이미지 번역(CLOVA Papago imgToimg)
- 길찾기(CLOVA Speech → LLM(목적지 추출) → 네이버 지도 API overlay)
- 질문 대답(CLOVA Speech → LLM)
- 키워드 스포팅(시리, 빅스비)을 통해 각 기능 호출
- 핸드폰 알림 기능 오버레이
- 환율 변환

## 실시간 대화 번역

---

- CLOVA SPEECH 스트리밍 인식 사용

### 실행 로직

1. 웹페이지 버튼 클릭 시 트리거
2. 사용자의 컴퓨터 마이크를 입력
3. 실시간 대화 번역 API 호출 및 응답
4. N초 단위로 업데이트하며 사용자 화면에 띄움

### 기술 스택

1. python
2. CLOVA SPEECH 스트리밍 인식
3. gRPC 이해

## 이미지 번역

---

- CLOVA Papago imgToimg

> 실시간 이미지 번역 구현 가능 여부 확인 필요
> 

### 실행 로직

1. 웹페이지 버튼 클릭 시 트리거
2. TTS를 통해 “움직이지 마세요” 음성 메시지 출력
3. 웹캠 화면 캡쳐 및 papago API 호출
4. 웹페이지 버튼 재클릭 전까지 웹캠 화면을 응답 받은 이미지로 대체

### 기술 스택

1. CLOVA Papago imgToimg
2. TTS
3. 이미지 처리

### 고도화 기능

---

- 환율 변환
    - 사용자의 음성 stt
    - OCR로 환율 정보 추출
    - LLM에 입력하여 메뉴판의 가격
- 실시간 번역
    - 사용자가 움직여도 해당 이미지를 실시간으로 번역

## 길찾기

---

- naver map api
- CLOVA SPEECH

### 실행 로직

1. 웹페이지 버튼 클릭 시 트리거
2. CLOVA SPEECH를 통해 stt
3. 사용자의 명령을 LLM에 입력 → 목적지 추출
4. 네이버 map API에 입력
5. 사용자 화면에 경로, 시간 등 정보 오버레이

## 기술 스택

1. CLOVA SPEECH
2. LLM
3. 네이버 MAP API
4. 이미지 처리

## 질문 응답

---

- RAG, LLM
- CLOVA Speech

### 실행 로직

1. 웹페이지 버튼 클릭 시 트리거
2. CLOVA SPEECH를 통해 stt
3. 사용자의 명령을 LLM에 입력 → 추론 후 응답
4. tts, 영상 overlay로 응답 출력

### 기술 스택

1. CLOVA SPEECH
2. LLM, RAG

## 기타 고도화 기능

---

- 키워드 스포팅(시리, 빅스비)을 통해 각 기능 호출
- 핸드폰 알림 기능 오버레이
- 환율 변환