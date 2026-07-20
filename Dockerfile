# Use Python 3.11 slim image as base for faster builds
FROM python:3.11-slim

# Set working directory
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MALLOC_ARENA_MAX=2 \
    OMP_NUM_THREADS=1 \
    TF_CPP_MIN_LOG_LEVEL=2

# Install system dependencies required by OpenCV headless and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire app
COPY . .

# Expose the default local port. Render injects PORT at runtime.
EXPOSE 8000

# Health check to verify the app is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Run the FastAPI app with Uvicorn
CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
