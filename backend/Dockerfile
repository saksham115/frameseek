# Shared image for the API and the worker Job. ffmpeg is needed for frame extraction,
# audio transcode and template rendering (libass burns in captions and text).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fontconfig \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# IP-to-country database (DB-IP Lite, CC BY 4.0) for the admin dashboard's geography.
# Best effort: without it, countries show as unknown.
COPY scripts/fetch_geoip.py /tmp/fetch_geoip.py
RUN mkdir -p /app/geoip && (python /tmp/fetch_geoip.py /app/geoip/dbip-country-lite.mmdb || true)

COPY app ./app
# Register the bundled OFL fonts with fontconfig so libass can also use them as fallbacks
# (for example Devanagari glyphs inside a Latin caption font).
RUN mkdir -p /usr/share/fonts/truetype/frameseek \
    && cp app/assets/fonts/*.ttf /usr/share/fonts/truetype/frameseek/ \
    && fc-cache -f
COPY migrations ./migrations
COPY alembic.ini .

EXPOSE 8000

# Default entrypoint is the API. The worker Job overrides the command with
# `python -m app.workers.consumer`; scheduled Jobs use `python -m app.workers.worker <task>`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
