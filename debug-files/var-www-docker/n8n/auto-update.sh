#!/bin/bash

# n8n Auto-Update Script
# Location: /var/www/docker/n8n/auto-update.sh
# Purpose: Automatically check and update n8n with backup and detailed logging

# Configuration
COMPOSE_DIR="/var/www/docker/n8n"
BACKUP_DIR="${COMPOSE_DIR}/backups"
LOG_DIR="${COMPOSE_DIR}/logs"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_FILE="${LOG_DIR}/n8n-updates_${TIMESTAMP}.log"

# Create directories if they don't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOG_DIR"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to log separator
log_separator() {
    echo "================================================================" | tee -a "$LOG_FILE"
}

# Start logging
log_separator
log_message "🚀 Starting n8n update check process"
log_separator

# Record start time
START_TIME=$(date +%s)

# Navigate to compose directory
cd "$COMPOSE_DIR" || {
    log_message "❌ ERROR: Failed to navigate to $COMPOSE_DIR"
    exit 1
}

# Get current version
log_message "📊 Checking current n8n version..."

# Try multiple methods to get the version
CURRENT_VERSION=""

# Method 1: Try docker exec (works if container has shell)
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION=$(docker exec n8n n8n --version 2>/dev/null | tr -d '\n')
fi

# Method 2: Check container labels
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION=$(docker inspect n8n --format='{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null)
fi

# Method 3: Check image labels
if [ -z "$CURRENT_VERSION" ]; then
    IMAGE_ID=$(docker inspect n8n --format='{{.Image}}' 2>/dev/null)
    CURRENT_VERSION=$(docker inspect "$IMAGE_ID" --format='{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null)
fi

# Method 4: Try to extract from image name/tag
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION=$(docker inspect n8n --format='{{index .Config.Image}}' 2>/dev/null | grep -oP ':\K[^:]+$')
fi

# Fallback
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION="unknown (distroless)"
fi

log_message "   Current version: $CURRENT_VERSION"

# Get current image digest
CURRENT_DIGEST=$(docker inspect --format='{{.Image}}' n8n 2>/dev/null)
log_message "   Current digest: ${CURRENT_DIGEST:0:20}..."

# Pull latest base image to check for updates
log_message ""
log_message "🔍 Checking for updates..."

# Pull the base n8n image from Dockerfile (get the last FROM statement for multi-stage builds)
BASE_IMAGE=$(grep "^FROM" Dockerfile | grep -v "AS" | tail -1 | awk '{print $2}')
log_message "   Pulling base image: $BASE_IMAGE"
docker pull "$BASE_IMAGE" >> "$LOG_FILE" 2>&1

# Get the base image digest (the actual n8n image we're using)
LATEST_BASE_DIGEST=$(docker inspect --format='{{.Id}}' "$BASE_IMAGE" 2>/dev/null)

# Get the parent image of the current running container
CURRENT_BASE_DIGEST=$(docker inspect n8n --format='{{.Image}}' 2>/dev/null)

# Compare the base image digests to see if there's an update
log_message "   Current base: ${CURRENT_BASE_DIGEST:0:20}..."
log_message "   Latest base:  ${LATEST_BASE_DIGEST:0:20}..."

# Check if the base image has been updated
if [ "$CURRENT_BASE_DIGEST" != "$LATEST_BASE_DIGEST" ]; then
    # Try multiple methods to get the latest version
    LATEST_VERSION=""
    
    # Method 1: Try running n8n --version (works if not distroless)
    if [ -z "$LATEST_VERSION" ]; then
        LATEST_VERSION=$(docker run --rm --entrypoint n8n "$BASE_IMAGE" --version 2>/dev/null | tr -d '\n')
    fi
    
    # Method 2: Check image labels
    if [ -z "$LATEST_VERSION" ]; then
        LATEST_VERSION=$(docker inspect "$BASE_IMAGE" --format='{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null)
    fi
    
    # Method 3: Extract from image tag
    if [ -z "$LATEST_VERSION" ]; then
        LATEST_VERSION=$(echo "$BASE_IMAGE" | grep -oP ':\K[^:]+$')
    fi
    
    # If we got a version, log it
    if [ -n "$LATEST_VERSION" ] && [ "$LATEST_VERSION" != "stable" ] && [ "$LATEST_VERSION" != "latest" ]; then
        log_message "   Latest available version: $LATEST_VERSION"
    else
        LATEST_VERSION="latest (digest: ${LATEST_BASE_DIGEST:0:12})"
        log_message "   Latest available version: $LATEST_VERSION"
    fi
    
    # Check if versions match - if they do, skip update even if digest differs
    # This prevents rebuilds when only Dockerfile changed but n8n version is same
    if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ] && [ "$LATEST_VERSION" != "stable" ] && [ "$LATEST_VERSION" != "latest" ]; then
        log_message "   Version numbers match - skipping rebuild"
        UPDATE_AVAILABLE=false
    else
        # Update if version differs or if using tag-based versions (stable/latest)
        UPDATE_AVAILABLE=true
    fi
else
    UPDATE_AVAILABLE=false
fi

# Check if update is available
if [ "$UPDATE_AVAILABLE" = true ]; then
    log_separator
    log_message "✨ Update detected! Starting update process..."
    log_message "   Updating from v$CURRENT_VERSION to v$LATEST_VERSION"
    log_separator
    
    # Create backup BEFORE attempting build
    BACKUP_NAME="n8n-data_${TIMESTAMP}.tar"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
    
    log_message "💾 Creating backup: $BACKUP_NAME"
    docker run --rm \
        -v "${COMPOSE_DIR}/data":/source \
        -v "$BACKUP_DIR":/backup \
        alpine tar cf "/backup/${BACKUP_NAME}" -C /source . >> "$LOG_FILE" 2>&1
    
    if [ -f "$BACKUP_PATH" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
        log_message "   ✅ Backup created successfully (Size: $BACKUP_SIZE)"
    else
        log_message "   ❌ ERROR: Backup creation failed!"
        exit 1
    fi
    
    # Rebuild the image with the new base
    log_message ""
    log_message "🔨 Rebuilding image with updated base..."
    
    # Attempt build and capture exit code
    if docker compose build --no-cache n8n >> "$LOG_FILE" 2>&1; then
        BUILD_SUCCESS=true
        log_message "   ✅ Build completed successfully"
    else
        BUILD_SUCCESS=false
        log_message "   ❌ ERROR: Build failed!"
        log_message "   Check log file for details: $LOG_FILE"
        
        # Show last 10 lines of build error
        log_message ""
        log_message "   Last build error lines:"
        tail -n 10 "$LOG_FILE" | while IFS= read -r line; do
            log_message "   $line"
        done
    fi
    
    # Only proceed with update if build succeeded
    if [ "$BUILD_SUCCESS" = true ]; then
        # Record downtime start
        DOWNTIME_START=$(date +%s)
        
        # Stop n8n
        log_message ""
        log_message "⏸️  Stopping n8n container..."
        docker compose down >> "$LOG_FILE" 2>&1
        log_message "   ✅ Container stopped"
        
        # Start updated n8n
        log_message ""
        log_message "🚀 Starting updated n8n container..."
        docker compose up -d >> "$LOG_FILE" 2>&1
        
        # Wait for n8n to be ready
        log_message "⏳ Waiting for n8n to be ready..."
        RETRY_COUNT=0
        MAX_RETRIES=30
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            if docker exec n8n n8n --version >> "$LOG_FILE" 2>&1; then
                break
            fi
            sleep 2
            RETRY_COUNT=$((RETRY_COUNT + 1))
        done
        
        # Record downtime end
        DOWNTIME_END=$(date +%s)
        DOWNTIME_DURATION=$((DOWNTIME_END - DOWNTIME_START))
        
        # Check if n8n is running
        if docker ps --format '{{.Names}}' | grep -q "^n8n$"; then
            # Try to get new version
            NEW_VERSION=$(docker exec n8n n8n --version 2>/dev/null | tr -d '\n')
            if [ -z "$NEW_VERSION" ]; then
                IMAGE_ID=$(docker inspect n8n --format='{{.Image}}' 2>/dev/null)
                NEW_VERSION=$(docker inspect "$IMAGE_ID" --format='{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null)
            fi
            if [ -z "$NEW_VERSION" ]; then
                NEW_VERSION="unknown (distroless)"
            fi
            
            log_separator
            log_message "✅ n8n updated successfully!"
            log_separator
            log_message "📈 UPDATE SUMMARY:"
            log_message "   • Previous version: $CURRENT_VERSION"
            log_message "   • New version: $NEW_VERSION"
            log_message "   • Downtime duration: ${DOWNTIME_DURATION} seconds"
            log_message "   • Backup location: $BACKUP_PATH"
            log_message "   • Backup size: $BACKUP_SIZE"
            log_separator
            
            # Clean up old Docker images
            log_message ""
            log_message "🧹 Cleaning up old Docker images..."
            docker image prune -f >> "$LOG_FILE" 2>&1
            log_message "   ✅ Cleanup completed"
            
            # Keep only last 10 backups
            log_message ""
            log_message "🗂️  Managing backups (keeping last 10)..."
            cd "$BACKUP_DIR" && ls -t n8n-data_*.tar 2>/dev/null | tail -n +11 | xargs -r rm -f
            BACKUP_COUNT=$(ls -1 n8n-data_*.tar 2>/dev/null | wc -l)
            log_message "   ✅ Total backups: $BACKUP_COUNT"
            
            # Keep only last 30 log files
            cd "$LOG_DIR" && ls -t n8n-updates_*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
            
        else
            log_separator
            log_message "❌ CRITICAL ERROR: Update failed! n8n is not running"
            log_separator
            log_message "🔄 Attempting rollback from backup..."
            
            # Stop failed container
            docker compose down >> "$LOG_FILE" 2>&1
            
            # Restore from backup
            docker run --rm \
                -v "${COMPOSE_DIR}/data":/dest \
                -v "$BACKUP_DIR":/backup \
                alpine sh -c "rm -rf /dest/* && tar xf /backup/${BACKUP_NAME} -C /dest" >> "$LOG_FILE" 2>&1
            
            # Start old version
            docker compose up -d >> "$LOG_FILE" 2>&1
            sleep 10
            
            if docker ps --format '{{.Names}}' | grep -q "^n8n$"; then
                log_message "✅ Rollback successful. Restored to version: $CURRENT_VERSION"
            else
                log_message "❌ CRITICAL: Rollback failed! Manual intervention required!"
                log_message "   Backup location: $BACKUP_PATH"
            fi
            
            log_separator
        fi
    else
        log_separator
        log_message "⚠️  UPDATE ABORTED: Build failed"
        log_separator
        log_message "   n8n container remains running on version: $CURRENT_VERSION"
        log_message "   Backup was created: $BACKUP_PATH"
        log_message ""
        log_message "🔧 TROUBLESHOOTING STEPS:"
        log_message "   1. Review full error in log: $LOG_FILE"
        log_message "   2. Test build manually: docker compose build --no-cache n8n"
        log_message "   3. For distroless images, use multi-stage build with Alpine"
        log_separator
    fi
    
else
    log_separator
    log_message "✅ Everything is up to date!"
    log_message "   Current version: $CURRENT_VERSION"
    log_message "   No updates available - n8n remains running"
    log_separator
fi

# Calculate total execution time
END_TIME=$(date +%s)
EXECUTION_TIME=$((END_TIME - START_TIME))

log_message ""
log_message "⏱️  Total execution time: ${EXECUTION_TIME} seconds"
log_message "📝 Log file: $LOG_FILE"
log_separator
log_message "✓ Update check process completed"
log_separator
