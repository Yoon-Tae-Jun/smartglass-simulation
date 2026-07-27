import grpc, json, queue, os
import sounddevice as sd
import nest_pb2, nest_pb2_grpc
from dotenv import load_dotenv

load_dotenv()
SECRET = os.environ["CLOVA_SPEECH_SECRET"]

audio_q = queue.Queue()

def on_audio(indata, frames, time, status):
    audio_q.put(bytes(indata))          # 마이크 오디오(16kHz int16)를 큐에 넣음

def generate_requests():
    # ① CONFIG 먼저 (언어 설정)
    yield nest_pb2.NestRequest(
        type=nest_pb2.RequestType.CONFIG,
        config=nest_pb2.NestConfig(config=json.dumps({"transcription": {"language": "ko"}})))
    # ② DATA: 마이크 청크를 계속 스트리밍
    seq = 0
    while True:
        chunk = audio_q.get()
        yield nest_pb2.NestRequest(
            type=nest_pb2.RequestType.DATA,
            data=nest_pb2.NestData(chunk=chunk,
                extra_contents=json.dumps({"seqId": seq, "epFlag": False})))
        seq += 1

def main():
    ch = grpc.secure_channel("clovaspeech-gw.ncloud.com:50051", grpc.ssl_channel_credentials())
    stub = nest_pb2_grpc.NestServiceStub(ch)
    meta = (("authorization", f"Bearer {SECRET}"),)      # 헤더 소문자 authorization
    print(">>> 말하세요! (종료: Ctrl+C)")
    with sd.RawInputStream(samplerate=16000, channels=1, dtype="int16",
                           blocksize=8000, callback=on_audio):
        try:
            for resp in stub.recognize(generate_requests(), metadata=meta):
                print("[원본]", resp.contents)            # ⭐ 응답 JSON 그대로 출력
        except grpc.RpcError as e:
            print("gRPC 에러:", e.code(), e.details())

if __name__ == "__main__":
    main()