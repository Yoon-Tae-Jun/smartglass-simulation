from .schemas import PingData


def get_ping_message() -> PingData:
    return PingData(message="pong")
