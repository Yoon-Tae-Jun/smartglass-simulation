import grpc, json, queue, threading
import nest_pb2, nest_pb2_grpc

CLOVA_ENDPOINT = "clovaspeech-gw.ncloud.com:50051"
SILENCE_FLUSH = 3   # 빈 응답 N번(약 1.2초) 연속 침묵이면 문장 확정 (숫자 줄이면 더 빨리 끊김)


class STTSession:
    """오디오를 feed()로 넣으면 인식 결과를 on_result 콜백으로 돌려주는 재사용 세션."""

    """
    PARAMS:
    - secret: CLOVA Speech 도메인 Secret Key
    - language: 인식 언어 (ko | en | ja)
    - translate_to: 번역 대상 언어. 지정하면 인식과 동시에 번역까지 받는다 (예: "ko")
    - on_result: 인식 결과 콜백. {"type", "text", "translated"} 를 받는다
    """
    def __init__(self, secret, language="ko", translate_to=None, on_result=None, debug=False):
        self.secret = secret
        self.language = language
        self.translate_to = translate_to
        self.on_result = on_result or (lambda r: None)
        self.debug = debug
        self._q = queue.Queue()
        self._seq = 0
        self._closed = False
        self._buffer = ""        # 현재 문장 누적 (인식 원문)
        self._translated = ""    # 현재 문장 누적 (번역문)
        self._silence = 0        # 연속 침묵 카운트

    # CONFIG 메시지에 실어 보낼 설정 (번역을 쓰면 translation 블록이 추가된다)
    def _config(self):
        config = {"transcription": {"language": self.language}}
        if self.translate_to:
            config["translation"] = {
                "targets": [self.translate_to],
                "mergedResult": True,
            }
        return config

    def _requests(self):
        yield nest_pb2.NestRequest(
            type=nest_pb2.RequestType.CONFIG,
            config=nest_pb2.NestConfig(config=json.dumps(self._config())))
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

    """
    누적 중인 문장 버퍼를 지정한 값으로 갈아끼우는 함수.
    호출어("헤이 글래스")를 인식한 뒤 호출어 부분은 버리고
    뒤에 남은 말만 명령 문장으로 이어가기 위해 사용한다.
    PARAMS:
    - text: 버퍼에 남길 문장 (기본값은 완전히 비움)
    """
    def reset_buffer(self, text: str = ""):
        self._buffer = text
        self._translated = ""
        self._silence = 0

    def _flush(self):
        final_text = self._buffer.strip()
        if final_text:
            self.on_result({
                "type": "final",
                "text": final_text,
                "translated": self._translated.strip() or None,
            })
        self._buffer = ""
        self._translated = ""
        self._silence = 0

    # 응답에서 번역문 조각을 꺼낸다 (translation.<대상언어>)
    def _translation_of(self, data):
        if not self.translate_to:
            return ""
        block = data.get("translation")
        if isinstance(block, dict):
            return block.get(self.translate_to) or ""
        # 일부 응답은 평평한 키로 내려오기도 한다
        return data.get(f"translation.{self.translate_to}") or ""

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
        seg_translated = self._translation_of(data)

        if seg_translated:
            self._translated += seg_translated

        if seg.strip():                       # 실제 음성 조각 → 누적
            self._buffer += seg
            self._silence = 0
            self.on_result({
                "type": "partial",
                "text": self._buffer.strip(),
                "translated": self._translated.strip() or None,
            })
        else:                                 # 빈 응답 = 침묵
            if self._buffer.strip():
                self._silence += 1
                if self._silence >= SILENCE_FLUSH:
                    self._flush()

        if tr.get("epFlag"):                  # epFlag 오면 즉시 확정 (보너스)
            self._flush()
