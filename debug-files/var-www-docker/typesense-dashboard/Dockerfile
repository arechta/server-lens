FROM bfritscher/typesense-dashboard:latest
LABEL io.server-lens.base-image="bfritscher/typesense-dashboard"

USER root

# Install useful tools
RUN apk add --no-cache \
    nano \
    curl \
    wget \
    bash \
    jq \
    ca-certificates

# Expose port
EXPOSE 80
