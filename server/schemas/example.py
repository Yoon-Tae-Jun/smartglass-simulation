from pydantic import BaseModel


class PingData(BaseModel):
    message: str
