import sounddevice as sd, wave
fs, sec = 16000, 6
print(">>> 6초 녹음 시작! 지금 말하세요 (예: '이거 apple이야 test입니다')")
audio = sd.rec(int(sec*fs), samplerate=fs, channels=1, dtype='int16')
sd.wait()
with wave.open("sample.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(fs)
    w.writeframes(audio.tobytes())
print(">>> 저장됨: sample.wav")