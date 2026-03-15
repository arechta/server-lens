FROM typesense/typesense:30.0.rc26
LABEL io.server-lens.base-image="typesense/typesense"

USER root

# Install useful tools
RUN apt-get update && apt-get install -y \
    nano \
    curl \
    wget \
    jq \
    net-tools \
    htop \
    vim \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 8108
