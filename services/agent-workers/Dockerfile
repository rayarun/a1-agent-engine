FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY services/agent-workers/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
# Note: we are currently copying only the worker folder.
# If we need shared py packages later, we will copy them here.
COPY services/agent-workers/ ./

# Environment configuration
ENV PYTHONUNBUFFERED=1

# Execution
ENTRYPOINT ["python", "-u", "main.py"]
