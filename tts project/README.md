# Kokoro TTS API (Modal Deployment)

A high-quality, lightweight Text-to-Speech API using the **Kokoro-82M** model, deployed on Modal.com. It supports English and Hindi with multiple voice options.

## 🚀 Deployed URL
**Base URL:** `https://devanandutkarsh7--kokoro-tts-api-fastapi-app.modal.run`

---

## 🛠 Features
- **High Quality:** Powered by Kokoro-82M.
- **Fast:** Inference runs on Modal's serverless infrastructure.
- **Multilingual:** Supports Hindi, US English, and British English.
- **Customizable:** Change voices and speaking speed (0.5x to 2.0x).

---

## 📖 API Documentation

### 1. Generate Speech (POST)
**Endpoint:** `/tts`

**Request Body:**
```json
{
  "text": "Hello, this is a test of the Kokoro TTS system.",
  "language": "en-us",
  "voice": "af_bella",
  "speed": 1.0
}
```

**Parameters:**
- `text` (Required): String (1 - 5000 characters).
- `language` (Optional): `hi`, `en-us` (default), `en-gb`.
- `voice` (Optional): Specific voice ID (see `/voices`).
- `speed` (Optional): Float from `0.5` to `2.0` (default `1.0`).

**Example (cURL):**
```bash
curl -X POST "https://devanandutkarsh7--kokoro-tts-api-fastapi-app.modal.run/tts" \
     -H "Content-Type: application/json" \
     -d '{"text": "नमस्ते, आप कैसे हैं?", "language": "hi"}' \
     --output output.wav
```

---

### 2. Quick Test (GET)
**Endpoint:** `/tts`

Useful for testing directly in a browser or simple audio tag.

**Example:**
`https://devanandutkarsh7--kokoro-tts-api-fastapi-app.modal.run/tts?text=Hello&language=en-us`

---

### 3. List Available Voices (GET)
**Endpoint:** `/voices`

Returns a list of all supported voices categorized by language.

**Example Response:**
```json
{
  "hi": { "default": "hf_alpha", "voices": ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"] },
  "en-us": { "default": "af_heart", "voices": ["af_heart", "af_bella", "af_sarah", "am_adam", "am_michael"] }
}
```

---

### 4. Health Check (GET)
**Endpoint:** `/`

Returns the service status.

---

## 🏗 Local Setup & Deployment

If you want to deploy your own instance on [Modal](https://modal.com):

1. **Install Modal:**
   ```bash
   pip install modal
   ```

2. **Setup/Login:**
   ```bash
   modal setup
   ```

3. **Deploy:**
   From the `tts project` directory, run:
   ```bash
   modal deploy deploy_model.py
   ```

---

## 📝 Notes
- **Cold Starts:** Since this is deployed on a serverless "0-to-1" architecture, the first request after a period of inactivity may take 10-15 seconds to spin up. Subsequent requests will be near-instant.
- **Hindi Support:** Ensure you select `language: "hi"` for Hindi text to use the correct phonemizer.
