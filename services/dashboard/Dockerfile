FROM python:3.10-slim

WORKDIR /app

# Install system dependencies and certificates
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add Zscaler certificate for corporate network
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates

# Copy requirements and install
COPY services/dashboard/requirements.txt ./
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
RUN pip install --no-cache-dir --cert /etc/ssl/certs/ca-certificates.crt -r requirements.txt

# Copy service code
COPY services/dashboard/ ./

# Expose Streamlit port
EXPOSE 8501

HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health

ENTRYPOINT ["streamlit", "run", "main.py", "--server.port=8501", "--server.address=0.0.0.0"]
