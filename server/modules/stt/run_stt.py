import os
import sounddevice as sd
from dotenv import load_dotenv
from stt_session import STTSession

load_dotenv()
SECRET = os.environ["CLOVA_SPEECH_SECRET"]

sess = STTSession(SECRET, on_result=lambda r: print(r), debug=True)   # debug=False → True
sess.start()

def on_audio(indata, frames, time, status):
    sess.feed(bytes(indata))

print(">>> 말하세요! (종료: Ctrl+C)")
with sd.RawInputStream(samplerate=16000, channels=1, dtype="int16", blocksize=8000, callback=on_audio):
    try:
        while True:
            sd.sleep(1000)
    except KeyboardInterrupt:
        sess.close()