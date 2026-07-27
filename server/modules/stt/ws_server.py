import os, json, asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from stt_session import STTSession
from keyword_spotter import detect_feature
from fastapi import UploadFile, File
from long_stt import recognize_bytes

load_dotenv()
SECRET = os.environ["CLOVA_SPEECH_SECRET"]
app = FastAPI()

@app.get("/")
async def index():
    with open("test.html", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.post("/api/dialog-stt")
async def dialog_stt(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    result = recognize_bytes(audio_bytes, filename=audio.filename or "audio.wav")
    return {"text": result["text"]} 

@app.websocket("/ws/stt")
async def ws_stt(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()

    def send(obj):
        asyncio.run_coroutine_threadsafe(
            ws.send_text(json.dumps(obj, ensure_ascii=False)), loop)

    def on_result(r):
        send(r)                                   # 표준 자막 전송
        if r["type"] == "final":                  # 최종 문장에서 키워드 판별
            feat = detect_feature(r["text"])
            if feat:
                send({"type": "wake", "feature": feat})

    sess = STTSession(SECRET, on_result=on_result)
    sess.start()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                sess.feed(msg["bytes"])
            elif msg.get("text"):
                if json.loads(msg["text"]).get("action") == "stop":
                    break
    except WebSocketDisconnect:
        pass
    finally:
        sess.close()