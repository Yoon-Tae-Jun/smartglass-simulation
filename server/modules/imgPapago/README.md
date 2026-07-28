# imgPapago

이미지 번역 모듈. 이미지 속 글자를 인식해 번역한 뒤, **번역문을 원본 이미지에 합성한 이미지**를 돌려준다
(파파고 Image Translation(Image)). 메뉴판·표지판을 카메라로 잡아 그대로 번역해 보여주는 용도다.

## 목차
- [호출 방법](#호출-방법)
- [필요 라이브러리](#필요-라이브러리)
- [모듈 구조](#모듈-구조)
- [출력 예시](#출력-예시)
- [작성자](#작성자)

## 호출 방법

REST와 음성 두 경로가 있다. 자세한 규격은 [`server/API.md`](../../API.md#3-이미지-번역-rest) 참고.

```bash
# 1) REST — 클라이언트가 직접 캡처해서 호출
POST /imgPapago/image

# 2) 음성 — "메뉴판 번역해줘" 등에서 wake feature=image 로 잡혀 자동 실행
#    (서버가 capture 이벤트로 화면을 요청 → 클라이언트가 그때 찍어 frame으로 응답)
```

서버 코드에서 직접 쓸 때:

```python
from modules.imgPapago.service import translate_image
from schemas.imgpapago import ImageTranslationRequest

# image는 base64 문자열 (브라우저 canvas.toDataURL()의 data URL도 그대로 받는다)
translate_image(ImageTranslationRequest(image=base64_string))
translate_image(ImageTranslationRequest(image=base64_string, source="ja", target="ko"))
```

## 필요 라이브러리
```
requests
python-dotenv
```

## 모듈 구조
```
imgPapago/
├── README.md
├── __init__.py
├── router.py
└── service.py
```

환경변수(API 키/URL)는 [`server/.env`](../../.env.example)에서 공통으로 관리한다.

| 환경변수 | 값 |
|---|---|
| `IMG_TRANSLATE_URL` | `https://papago.apigw.ntruss.com/image-to-image/v1/translate` |
| `PAPAGO_CLIENT_ID` | 콘솔에서 발급한 Client ID |
| `PAPAGO_SECRET_KEY` | 콘솔에서 발급한 Client Secret |

키가 없으면 서버가 뜨지 않는 대신(다른 모듈까지 막힌다) 호출 시점에 `500`을 반환한다.

## 출력 예시

모든 응답은 공통 포맷 [`BaseResponse`](../../schemas/base.py)로 감싸서 나간다 (`status`, `msg`, `data`).

**translate_image 결과**
```json
{
  "status": 200,
  "msg": "success",
  "data": {
    "rendered_image": "iVBORw0KGgoAAAANSUhEUg...",
    "source_text": "ラーメン 800円",
    "target_text": "라멘 800엔"
  }
}
```

- `rendered_image`: 번역문이 얹힌 결과 이미지. base64이며 `data:` 접두사는 **없다**
  (`<img src="data:image/png;base64,...">`로 쓰려면 클라이언트가 붙인다)
- `source_text` / `target_text`: 이미지 전체에서 인식된 원문과 번역문

**실패**
```json
{ "status": 404, "msg": "이미지에서 번역할 글자를 찾지 못했습니다", "data": null }
```

| status | 언제 |
|---|---|
| 400 | `image`가 비었거나 base64로 해석되지 않음 |
| 404 | 이미지에서 글자를 찾지 못함 |
| 500 | 환경변수 미설정 |
| 502 | 파파고 호출 실패 또는 응답 형식이 예상과 다름 |

### 파파고 제약

- 형식: JPG · JPEG · PNG · TIFF
- 크기: 이미지당 20MB 이내, 1960×1960px 이내
- `source`: `auto` · `ko` · `en` · `ja` · `zh-CN` · `zh-TW` · `vi` · `th` · `id` · `fr` · `es` · `ru`
- `target`: 위 목록 + `de` · `it`

## 작성자
윤태준
