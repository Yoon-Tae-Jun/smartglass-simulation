import grpc, json, queue, threading
import nest_pb2, nest_pb2_grpc

CLOVA_ENDPOINT = "clovaspeech-gw.ncloud.com:50051"
SILENCE_FLUSH = 3   # 빈 응답 N번(약 1.2초) 연속 침묵이면 문장 확정 (숫자 줄이면 더 빨리 끊김)

class STTSession:
    """오디오를 feed()로 넣으면 인식 결과를 on_result 콜백으로 돌려주는 재사용 세션."""
    def __init__(self, secret, language="ko", on_result=None, debug=False):
        self.secret = secret
        self.language = language
        self.on_result = on_result or (lambda r: None)
        self.debug = debug
        self._q = queue.Queue()
        self._seq = 0
        self._closed = False
        self._buffer = ""       # 현재 문장 누적
        self._silence = 0       # 연속 침묵 카운트

    def _requests(self):
        yield nest_pb2.NestRequest(
            type=nest_pb2.RequestType.CONFIG,
            config=nest_pb2.NestConfig(config=json.dumps({"transcription": {"language": self.language}})))
        while True:
            chunk = self._q.get()
            if chunk is None:
                break
            yield nest_pb2.NestRequest(
                type=nest_pb2.RequestType.DATA,
                data=nest_pb2.NestData(chunk=chunk,
                    extra_contents=json.dumps({"seqId": self._seq, "epFlag": False})))
            self._seq += 1

    def start(self):
        ch = grpc.secure_channel(CLOVA_ENDPOINT, grpc.ssl_channel_credentials())
        stub = nest_pb2_grpc.NestServiceStub(ch)
        meta = (("authorization", f"Bearer {self.secret}"),)
        def run():
            try:
                for resp in stub.recognize(self._requests(), metadata=meta):
                    self._emit(resp.contents)
            except grpc.RpcError as e:
                print("[STT] gRPC error:", e.code(), e.details())
        threading.Thread(target=run, daemon=True).start()

    def feed(self, pcm_chunk: bytes):
        if not self._closed:
            self._q.put(pcm_chunk)

    def close(self):
        self._closed = True
        self._q.put(None)

    def _flush(self):
        final_text = self._buffer.strip()
        if final_text:
            self.on_result({"type": "final", "text": final_text})
        self._buffer = ""
        self._silence = 0

    def _emit(self, contents: str):
        if self.debug:
            print("[원본]", contents)
        try:
            data = json.loads(contents)
        except Exception:
            return
        tr = data.get("transcription")
        if tr is None:
            return
        seg = tr.get("text", "")

        if seg.strip():                       # 실제 음성 조각 → 누적
            self._buffer += seg
            self._silence = 0
            self.on_result({"type": "partial", "text": self._buffer.strip()})
        else:                                 # 빈 응답 = 침묵
            if self._buffer.strip():
                self._silence += 1
                if self._silence >= SILENCE_FLUSH:
                    self._flush()

        if tr.get("epFlag"):                  # epFlag 오면 즉시 확정 (보너스)
            self._flush()