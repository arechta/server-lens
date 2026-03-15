# Start from the official Redis image
FROM redis:latest
LABEL io.server-lens.base-image="library/redis"

USER root

# Install build dependencies and useful tools
# First, update the package lists
RUN apt-get update \
    # Now, install the packages
    && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    sqlite3 \
    nano \
    git \
    curl \
    wget \
    bash \
    net-tools \
    htop \
    vim \
    jq \
    ca-certificates \
    # Clean up the cache to keep the image small
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER redis
