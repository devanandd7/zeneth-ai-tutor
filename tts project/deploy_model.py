"""
╔══════════════════════════════════════════════════════╗
║         KOKORO TTS  —  Modal.com Free Deploy         ║
║  Hindi + English support | FastAPI | ~$0 cost        ║
╠══════════════════════════════════════════════════════╣
║  SETUP:                                              ║
║  1. pip install modal                                ║
║  2. modal setup          (login karo)                ║
║  3. modal deploy deploy_modal.py                     ║
║                                                      ║
║  TEST:                                               ║
║  curl -X POST https://your-url.modal.run/tts \       ║
║    -H "Content-Type: application/json" \             ║
║    -d '{"text":"नमस्ते","language":"hi"}' \           ║
║    --output hindi.wav                                ║
╚══════════════════════════════════════════════════════╝
"""

import io
import modal
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Literal

# ── Docker Image ───────────────────────────────────────────────────────────────
# Modal automatically builds this container — espeak-ng is required for Kokoro
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng", "libsndfile1")
    .pip_install(
        "kokoro>=0.7.0",
        "soundfile",
        "numpy",
        "fastapi[standard]",
        "pydantic>=2.0",
    )
    .env({"HF_HOME": "/cache"})  # cache models inside the persistent volume
)

# ── Persistent Volume (model downloads sirf ek baar hote hain) ────────────────
CACHE_PATH = "/cache"
hf_cache = modal.Volume.from_name("kokoro-hf-cache", create_if_missing=True)

# ── Modal App ──────────────────────────────────────────────────────────────────
app = modal.App("kokoro-tts-api")

# ── Language Map ───────────────────────────────────────────────────────────────
LANG_CODE = {
    "hi":    "h",   # Hindi
    "en-us": "a",   # American English
    "en-gb": "b",   # British English
}

DEFAULT_VOICE = {
    "hi":    "hf_alpha",
    "en-us": "af_heart",
    "en-gb": "bf_emma",
}

# ── Request Schema ─────────────────────────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: Literal["hi", "en-us", "en-gb"] = "en-us"
    voice: Optional[str] = None
    speed: float = Field(1.0, ge=0.5, le=2.0)

# ── FastAPI Instance ───────────────────────────────────────────────────────────
from fastapi.middleware.cors import CORSMiddleware

web_app = FastAPI(title="Kokoro TTS API (Modal)", version="1.0.0")

# Allow all browser origins (localhost dev + any deployed frontend)
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core Function (runs in Modal container) ────────────────────────────────────
@app.function(
    image=image,
    volumes={CACHE_PATH: hf_cache},
    cpu=2,                          # 2 CPUs — enough for fast inference
    memory=2048,                    # 2GB RAM
    timeout=120,                    # max 2 min per request
    min_containers=0,               # 0 = fully serverless (free), 1 = always warm ($)
)
@modal.asgi_app()
def fastapi_app():
    """Returns the FastAPI app — Modal serves this as HTTPS automatically."""

    @web_app.get("/")
    def health():
        return {"status": "ok", "service": "Kokoro TTS on Modal", "version": "1.0.0"}

    @web_app.get("/voices")
    def voices():
        return {
            "hi":    {"default": "hf_alpha", "voices": ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"]},
            "en-us": {"default": "af_heart",  "voices": ["af_heart", "af_bella", "af_sarah", "am_adam", "am_michael"]},
            "en-gb": {"default": "bf_emma",   "voices": ["bf_emma", "bf_isabella", "bm_george", "bm_lewis"]},
        }

    @web_app.post("/tts")
    def tts(req: TTSRequest):
        """
        Generate speech from text.

        Hindi example:
          {"text": "नमस्ते, आप कैसे हैं?", "language": "hi"}

        English example:
          {"text": "Hello! This is Kokoro.", "language": "en-us", "voice": "af_bella"}
        """
        import soundfile as sf
        import numpy as np
        from kokoro import KPipeline

        lang_code = LANG_CODE.get(req.language)
        if not lang_code:
            raise HTTPException(400, f"Unsupported language: {req.language}")

        voice = req.voice or DEFAULT_VOICE[req.language]

        try:
            pipeline = KPipeline(lang_code=lang_code)
            chunks = []
            for _, _, audio in pipeline(req.text, voice=voice, speed=req.speed):
                if audio is not None and len(audio) > 0:
                    chunks.append(audio)

            if not chunks:
                raise HTTPException(500, "No audio generated")

            full_audio = np.concatenate(chunks)
            buf = io.BytesIO()
            sf.write(buf, full_audio, samplerate=24000, format="WAV")
            buf.seek(0)

            return StreamingResponse(
                buf,
                media_type="audio/wav",
                headers={"Content-Disposition": 'attachment; filename="speech.wav"'},
            )
        except Exception as e:
            raise HTTPException(500, f"TTS error: {str(e)}")

    @web_app.get("/tts")
    def tts_get(text: str, language: str = "en-us", voice: Optional[str] = None, speed: float = 1.0):
        """Quick browser/curl test endpoint."""
        return tts(TTSRequest(text=text, language=language, voice=voice, speed=speed))

    return web_app