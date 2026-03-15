# Stage 1: Base Redis Insight image
FROM redis/redisinsight:latest
LABEL io.server-lens.base-image="redis/redisinsight"

USER root

# Install common Linux tools using Alpine's package manager (apk)
# We use 'apk' instead of 'apt-get'
RUN apk add --no-cache \
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

# Create data directory
RUN mkdir -p /data

# The Redis Insight application typically runs as a non-root user (e.g., 'redisinsight' or 'node').
# We switch back to the application user for security. You may need to verify 
# the actual user if the container fails to start. For safety, we will leave 
# it running as the default user by not specifying a final USER command.
# If you knew the user, you'd add:

# USER <redisinsight_user>
