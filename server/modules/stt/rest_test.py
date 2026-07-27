import requests, json, os
from dotenv import load_dotenv
load_dotenv()

INVOKE_URL = os.environ["CLOVA_SPEECH_INVOKE_URL"].rstrip("/")
SECRET     = os.environ["CLOVA_SPEECH_SECRET"]

def recognize(file_path, language="ko"):
    url = INVOKE_URL + "/recognizer/upload"
    headers = {"X-CLOVASPEECH-API-KEY": SECRET}
    params = {
        "language": language,
        "completion": "sync",
        "fullText": True,
    }
    files = {
        "media": open(file_path, "rb"),
        "params": (None, json.dumps(params), "application/json"),
    }
    r = requests.post(url, headers=headers, files=files)
    return r.json()

if __name__ == "__main__":
    result = recognize("sample.wav", language="enko")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("\n>>> 인식 텍스트:", result.get("text"))