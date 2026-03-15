# Multi-stage build: Get apk from Alpine, then add to n8n
FROM alpine:latest AS alpine

FROM docker.n8n.io/n8nio/n8n:stable
LABEL io.server-lens.base-image="n8nio/n8n"

# Copy apk and its dependencies from Alpine
COPY --from=alpine /sbin/apk /sbin/apk
COPY --from=alpine /usr/lib/libapk.so* /usr/lib/
COPY --from=alpine /lib/libcrypto.so* /lib/
COPY --from=alpine /lib/libssl.so* /lib/
COPY --from=alpine /lib/libz.so* /lib/

USER root

# Now you can use apk to install packages
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    nano \
    git \
    curl \
    wget \
    bash \
    net-tools \
    htop \
    vim \
    jq \
    ca-certificates

# Install Baileys
RUN npm install -g @whiskeysockets/baileys

USER node

# Allow all external npm packages
ENV NODE_FUNCTION_ALLOW_EXTERNAL=*

WORKDIR /home/node/.n8n

EXPOSE 5678
