"""SafeHer FastAPI backend — Stage 1 Live bridge."""

from __future__ import annotations

import logging

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .live_bridge import LiveBridge

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

settings = get_settings()
app = FastAPI(title="SafeHer Backend", version="0.1.0")

origins = (
    ["*"]
    if settings.cors_origins.strip() == "*"
    else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "safeher-backend"}


@app.websocket(settings.ws_path)
async def ws_live(websocket: WebSocket) -> None:
    bridge = LiveBridge(websocket, settings)
    await bridge.run()
