from fastapi import APIRouter

from schemas.base import BaseResponse
from schemas.map import Coordinate, DirectionsData, DirectionsRequest, PlaceInfo

from .service import geocode, get_directions, search_place

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/search", response_model=BaseResponse[PlaceInfo])
def search(query: str):
    return search_place(query)


@router.get("/geocode", response_model=BaseResponse[Coordinate])
def geocode_address(address: str):
    return geocode(address)


@router.post("/directions", response_model=BaseResponse[DirectionsData])
def directions(request: DirectionsRequest):
    return get_directions(request)
