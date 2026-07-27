import sys
from pathlib import Path

# 생성된 protobuf 스텁(nest_pb2*.py)이 서로를 절대 경로로 import하므로 모듈 폴더를 sys.path에 추가
_MODULE_DIR = str(Path(__file__).parent)
if _MODULE_DIR not in sys.path:
    sys.path.append(_MODULE_DIR)
