FROM postgres:15
LABEL io.server-lens.base-image="library/postgres"

USER root

# Install build dependencies and useful tools
# Using 'apt-get' as the postgres:15 official image is typically based on Debian/Ubuntu,
# unlike the N8N image which uses 'apk' (Alpine).
RUN apt-get update && apt-get install -y --no-install-recommends \
    nano \
    git \
    curl \
    wget \
    bash \
    net-tools \
    vim \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create data directory
RUN mkdir -p /data

USER postgres
