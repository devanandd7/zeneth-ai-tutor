# Base image
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    espeak-ng \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- PRE-DOWNLOAD MODELS DURING BUILD ---
# This ensures they are baked into the image and don't use RAM/Time during first request
RUN python3 -c "from kokoro import KPipeline; KPipeline(lang_code='a'); KPipeline(lang_code='h')"

COPY . .

EXPOSE 8000

# Final optimization for low RAM
CMD uvicorn local_server:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 300
