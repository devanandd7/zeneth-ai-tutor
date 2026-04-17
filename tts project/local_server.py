import io
import gc
import uvicorn
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Literal
import soundfile as sf
import numpy as np
from kokoro import KPipeline

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
app = FastAPI(title="Kokoro TTS API", version="1.1.0")

# Global variables for memory management
current_lang = None
pipeline = None

def get_pipeline(lang_code):
    global current_lang, pipeline
    # Only reload if language changed to save RAM
    if pipeline is None or current_lang != lang_code:
        print(f"Switching/Loading pipeline for: {lang_code}")
        # Clear old pipeline first to free RAM
        pipeline = None
        gc.collect() 
        pipeline = KPipeline(lang_code=lang_code)
        current_lang = lang_code
    return pipeline

# Broad CORS support for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    return {"status": "ok", "service": "Kokoro TTS", "version": "1.1.0"}

@app.get("/voices")
def voices():
    return {
        "hi":    {"default": "hf_alpha", "voices": ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"]},
        "en-us": {"default": "af_heart",  "voices": ["af_heart", "af_bella", "af_sarah", "am_adam", "am_michael"]},
        "en-gb": {"default": "bf_emma",   "voices": ["bf_emma", "bf_isabella", "bm_george", "bm_lewis"]},
    }

@app.post("/tts")
def tts(req: TTSRequest):
    lang_code = LANG_CODE.get(req.language)
    if not lang_code:
        raise HTTPException(400, f"Unsupported language: {req.language}")

    voice = req.voice or DEFAULT_VOICE[req.language]

    try:
        # Get the global pipeline instance
        p = get_pipeline(lang_code)
        
        chunks = []
        for _, _, audio in p(req.text, voice=voice, speed=req.speed):
            if audio is not None and len(audio) > 0:
                chunks.append(audio)

        if not chunks:
            raise HTTPException(500, "Inference error: Engine produced no audio.")

        full_audio = np.concatenate(chunks)
        buf = io.BytesIO()
        sf.write(buf, full_audio, samplerate=24000, format="WAV")
        buf.seek(0)

        # Clear memory after each generation spike
        gc.collect()

        return StreamingResponse(
            buf,
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'attachment; filename="speech.wav"',
                "Access-Control-Allow-Origin": "*" # Redundant but safe
            },
        )
    except Exception as e:
        print(f"TTS ERROR: {str(e)}")
        # If we crashed, clear the pipeline to be safe next time
        global pipeline, current_lang
        pipeline = None
        current_lang = None
        gc.collect()
        raise HTTPException(500, f"Production TTS error: {str(e)}")

@app.get("/tts")
def tts_get(text: str, language: str = "en-us", voice: Optional[str] = None, speed: float = 1.0):
    return tts(TTSRequest(text=text, language=language, voice=voice, speed=speed))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Listening on port {port}")
    uvicorn.run("local_server:app", host="0.0.0.0", port=port, workers=1, reload=False)
