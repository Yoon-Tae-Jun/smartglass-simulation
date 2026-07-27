from pathlib import Path

from dotenv import load_dotenv

# 모든 모듈의 환경변수는 server/.env 한 곳에서 관리한다
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env() -> None:
    """service.py 상단에서 호출해 server/.env를 읽어온다."""
    load_dotenv(dotenv_path=ENV_PATH)
