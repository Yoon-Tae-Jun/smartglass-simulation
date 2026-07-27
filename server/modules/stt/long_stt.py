import requests, json, os
from dotenv import load_dotenv
load_dotenv()

INVOKE_URL = os.environ["CLOVA_SPEECH_INVOKE_URL"].rstrip("/")
SECRET     = os.environ["CLOVA_SPEECH_SECRET"]

def recognize_bytes(audio_bytes, filename="audio.wav", language="enko"):
    """오디오 바이트를 CLOVA 장문 인식(한/영 동시)으로 텍스트 변환."""
    url = INVOKE_URL + "/recognizer/upload"
    headers = {"X-CLOVASPEECH-API-KEY": SECRET}
    params = {"language": language, "completion": "sync", "fullText": True}
    files = {
        "media": (filename, audio_bytes, "application/octet-stream"),
        "params": (None, json.dumps(params), "application/json"),
    }
    data = requests.post(url, headers=headers, files=files).json()
    return {"text": data.get("text", ""), "segments": data.get("segments", [])}