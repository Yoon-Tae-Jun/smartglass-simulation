import importlib
import pkgutil

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import modules

app = FastAPI(title="Smart Glass Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


def register_module_routers(app: FastAPI) -> None:
    for module_info in pkgutil.iter_modules(modules.__path__):
        try:
            router_module = importlib.import_module(
                f"modules.{module_info.name}.router"
            )
        except ModuleNotFoundError:
            continue

        router = getattr(router_module, "router", None)
        if router is not None:
            app.include_router(router)


register_module_routers(app)
