"""Application settings loaded from backend/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8000
    ws_path: str = "/ws/live"

    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash-native-audio-preview-12-2025"

    audio_input_sample_rate: int = 16000
    audio_input_channels: int = 1
    audio_input_encoding: str = "pcm16"
    audio_output_sample_rate: int = 24000
    audio_output_channels: int = 1
    audio_output_encoding: str = "pcm16"

    overpass_url: str = "https://overpass-api.de/api/interpreter"
    safe_haven_radius_m: int = 800
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
