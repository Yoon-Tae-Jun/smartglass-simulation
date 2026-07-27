import grpc, json, queue, threading
import nest_pb2, nest_pb2_grpc

CLOVA_ENDPOINT = "clovaspeech-gw.ncloud.com:50051"
SILENCE_FLUSH = 3

class STTSession:
    def __init__(self, secret, language="ko", translate_to=None, on_result=None, debug=False):
        self.secret = secret
        self.language = language
        self.translate_to = translate_to
        self.on_result = on_result or (lambda r: None)
        self.debug = debug
        self._q = queue.Queue(); self._seq = 0; self._closed = False
        self._buffer = ""; self._trans = ""; self._silence = 0

    def _requests(self):
        cfg = {"transcription": {"language": self.language}}
        if self.translate_to:
            cfg["translation"] = {"targets": [self.translate_to], "mergedResult": True}
        yield nest_pb2.NestRequest(type=nest_pb2.RequestType.CONFIG,
            config=nest_pb2.NestConfig(config=json.dumps(cfg)))
        while True:
            chunk = self._q.get()
            if chunk is None: break
            yield nest_pb2.NestRequest(type=nest_pb2.RequestType.DATA,
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

    def feed(self, pcm_chunk):
        if not self._closed: self._q.put(pcm_chunk)

    def close(self):
        self._closed = True; self._q.put(None)

    def _flush(self):
        text = self._buffer.strip(); trans = self._trans.strip()
        if text:
            self.on_result({"type": "final", "text": text, "translated": trans})
        self._buffer = ""; self._trans = ""; self._silence = 0

    def _emit(self, contents):
        if self.debug: print("[원본]", contents)
        try: data = json.loads(contents)
        except Exception: return
        tr = data.get("transcription")
        if tr is None: return
        seg = tr.get("text", "")
        trans_seg = (data.get("translation") or {}).get(self.translate_to, "") if self.translate_to else ""
        if seg.strip():
            self._buffer += seg
            if trans_seg.strip(): self._trans += trans_seg.strip() + " "
            self._silence = 0
            self.on_result({"type": "partial", "text": self._buffer.strip(), "translated": self._trans.strip()})
        else:
            if self._buffer.strip():
                self._silence += 1
                if self._silence >= SILENCE_FLUSH: self._flush()
        if tr.get("epFlag"): self._flush()
