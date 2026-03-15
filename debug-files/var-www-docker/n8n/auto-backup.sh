#!/bin/bash

# n8n Auto-Backup Script
# Location: /var/www/docker/n8n/auto-backup.sh
# Purpose: Automatically backup n8n data and configurations

# Configuration
COMPOSE_DIR="/var/www/docker/n8n"
BACKUP_DIR="${COMPOSE_DIR}/backups"
LOG_DIR="${COMPOSE_DIR}/logs"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_FILE="${LOG_DIR}/n8n-backups_${TIMESTAMP}.log"

# Backup retention settings
KEEP_BACKUPS=30  # Keep last 30 backups
KEEP_LOGS=60     # Keep last 60 log files

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
log_message "💾 Starting n8n backup process"
log_separator

# Record start time
START_TIME=$(date +%s)

# Navigate to compose directory
cd "$COMPOSE_DIR" || {
    log_message "❌ ERROR: Failed to navigate to $COMPOSE_DIR"
    exit 1
}

# Check if n8n container is running
if ! docker ps --format '{{.Names}}' | grep -q "^n8n$"; then
    log_message "⚠️  WARNING: n8n container is not running!"
    log_message "   Backup will continue, but this is unusual."
fi

# Get current n8n version
log_message "📊 Current n8n information:"
CURRENT_VERSION=$(docker exec n8n n8n --version 2>/dev/null | tr -d '\n' || echo "unknown")
log_message "   • Version: $CURRENT_VERSION"

# Get container uptime
CONTAINER_STARTED=$(docker inspect n8n --format='{{.State.StartedAt}}' 2>/dev/null | cut -d'.' -f1)
log_message "   • Started at: $CONTAINER_STARTED"

# Get data size before backup
DATA_SIZE=$(du -sh "${COMPOSE_DIR}/data" 2>/dev/null | cut -f1)
log_message "   • Data size: $DATA_SIZE"

# Count workflows
WORKFLOW_COUNT=$(docker exec n8n sqlite3 /home/node/.n8n/database.sqlite "SELECT COUNT(*) FROM workflow_entity;" 2>/dev/null || echo "0")
log_message "   • Total workflows: $WORKFLOW_COUNT"

# Count credentials
CREDENTIAL_COUNT=$(docker exec n8n sqlite3 /home/node/.n8n/database.sqlite "SELECT COUNT(*) FROM credentials_entity;" 2>/dev/null || echo "0")
log_message "   • Total credentials: $CREDENTIAL_COUNT"

# Count active workflows
ACTIVE_WORKFLOW_COUNT=$(docker exec n8n sqlite3 /home/node/.n8n/database.sqlite "SELECT COUNT(*) FROM workflow_entity WHERE active = 1;" 2>/dev/null || echo "0")
log_message "   • Active workflows: $ACTIVE_WORKFLOW_COUNT"

# Check if database exists
if [ -f "${COMPOSE_DIR}/data/database.sqlite" ]; then
    DB_SIZE=$(du -sh "${COMPOSE_DIR}/data/database.sqlite" 2>/dev/null | cut -f1)
    log_message "   • Database size: $DB_SIZE"
    log_message "   • Database file: ✅ Present"
else
    log_message "   • Database file: ⚠️  Not found"
fi

# List active workflows with details
if [ "$ACTIVE_WORKFLOW_COUNT" -gt "0" ]; then
    log_message ""
    log_separator
    log_message "🔄 Active Workflows (sorted by last updated):"
    log_separator
    
    # Query active workflows ordered by updatedAt
    docker exec n8n sqlite3 /home/node/.n8n/database.sqlite \
        "SELECT name, id, updatedAt FROM workflow_entity WHERE active = 1 ORDER BY updatedAt DESC;" 2>/dev/null | \
    awk -F'|' '{
        counter++
        name=$1
        id=$2
        timestamp=$3
        
        # Convert timestamp (format: "2025-10-22T03:30:45.123Z" or similar)
        # Extract date and time parts
        split(timestamp, dt, "T")
        date_part=dt[1]
        
        # Extract time part (remove everything after the first dot or Z or +/-)
        time_full=dt[2]
        gsub(/\.[0-9]+Z?$/, "", time_full)  # Remove milliseconds and Z
        gsub(/\+.*$/, "", time_full)         # Remove timezone offset like +07:00
        gsub(/-[0-9]{2}:.*$/, "", time_full) # Remove timezone offset like -05:00
        time_part=time_full
        
        # Format date from YYYY-MM-DD to YYYY/MM/DD
        gsub("-", "/", date_part)
        
        printf "[%s] %d. %s\n", strftime("%Y-%m-%d %H:%M:%S"), counter, name
        printf "[%s]    - ID: %s\n", strftime("%Y-%m-%d %H:%M:%S"), id
        printf "[%s]    - Last updated: %s %s\n", strftime("%Y-%m-%d %H:%M:%S"), date_part, time_part
        if (counter < NR) printf "[%s]\n", strftime("%Y-%m-%d %H:%M:%S")
    }' | tee -a "$LOG_FILE"
fi

log_message ""
log_separator
log_message "🗜️  Creating backup archive..."
log_separator

# Create backup filename
BACKUP_NAME="n8n-data_${TIMESTAMP}.tar"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Create the backup
log_message "   Source: ${COMPOSE_DIR}/data"
log_message "   Destination: ${BACKUP_PATH}"
log_message ""
log_message "⏳ Backup in progress..."

docker run --rm \
    -v "${COMPOSE_DIR}/data":/source \
    -v "$BACKUP_DIR":/backup \
    alpine tar cf "/backup/${BACKUP_NAME}" -C /source . >> "$LOG_FILE" 2>&1

# Check if backup was created successfully
if [ -f "$BACKUP_PATH" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
    BACKUP_SIZE_BYTES=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null)
    BACKUP_SIZE_MB=$((BACKUP_SIZE_BYTES / 1024 / 1024))
    
    log_separator
    log_message "✅ Backup created successfully!"
    log_separator
    log_message "📦 BACKUP DETAILS:"
    log_message "   • Filename: $BACKUP_NAME"
    log_message "   • Location: $BACKUP_PATH"
    log_message "   • Size: $BACKUP_SIZE (${BACKUP_SIZE_MB} MB)"
    log_message "   • Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    log_separator
else
    log_separator
    log_message "❌ ERROR: Backup creation failed!"
    log_separator
    log_message "   Expected location: $BACKUP_PATH"
    log_message "   Please check disk space and permissions."
    exit 1
fi

# Verify backup integrity
log_message ""
log_message "🔍 Verifying backup integrity..."
if tar -tf "$BACKUP_PATH" > /dev/null 2>&1; then
    log_message "   ✅ Backup archive is valid"
    
    # List what's inside the backup
    log_message ""
    log_message "📋 Backup contents:"
    BACKUP_FILES=$(tar -tf "$BACKUP_PATH" 2>/dev/null | wc -l)
    log_message "   • Total files/directories: $BACKUP_FILES"
    
    # Check for critical files
    if tar -tf "$BACKUP_PATH" 2>/dev/null | grep -q "database.sqlite"; then
        log_message "   ✅ Database file present"
    else
        log_message "   ⚠️  WARNING: Database file not found in backup!"
    fi
    
    if tar -tf "$BACKUP_PATH" 2>/dev/null | grep -q "config"; then
        log_message "   ✅ Config file present"
    fi
else
    log_message "   ❌ WARNING: Backup archive may be corrupted!"
fi

# Manage old backups
log_message ""
log_separator
log_message "🗂️  Managing backup retention..."
log_separator

cd "$BACKUP_DIR"
TOTAL_BACKUPS=$(ls -1 n8n-data_*.tar 2>/dev/null | wc -l)
log_message "   • Total backups before cleanup: $TOTAL_BACKUPS"

if [ "$TOTAL_BACKUPS" -gt "$KEEP_BACKUPS" ]; then
    BACKUPS_TO_DELETE=$((TOTAL_BACKUPS - KEEP_BACKUPS))
    log_message "   • Removing $BACKUPS_TO_DELETE old backup(s)..."
    
    ls -t n8n-data_*.tar 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while read -r old_backup; do
        OLD_SIZE=$(du -h "$old_backup" | cut -f1)
        log_message "     - Deleting: $old_backup ($OLD_SIZE)"
        rm -f "$old_backup"
    done
fi

REMAINING_BACKUPS=$(ls -1 n8n-data_*.tar 2>/dev/null | wc -l)
TOTAL_BACKUP_SIZE=$(du -sh . 2>/dev/null | cut -f1)
log_message "   • Backups remaining: $REMAINING_BACKUPS"
log_message "   • Total backup size: $TOTAL_BACKUP_SIZE"

# Manage old log files
cd "$LOG_DIR"
TOTAL_LOGS=$(ls -1 n8n-backups_*.log 2>/dev/null | wc -l)

if [ "$TOTAL_LOGS" -gt "$KEEP_LOGS" ]; then
    log_message "   • Cleaning up old log files..."
    ls -t n8n-backups_*.log 2>/dev/null | tail -n +$((KEEP_LOGS + 1)) | xargs -r rm -f
    REMAINING_LOGS=$(ls -1 n8n-backups_*.log 2>/dev/null | wc -l)
    log_message "     ✅ Kept last $REMAINING_LOGS log files"
fi

# Calculate execution time
END_TIME=$(date +%s)
EXECUTION_TIME=$((END_TIME - START_TIME))

log_message ""
log_separator
log_message "📊 BACKUP SUMMARY:"
log_message "   • n8n version: $CURRENT_VERSION"
log_message "   • Total workflows: $WORKFLOW_COUNT"
log_message "   • Total credentials: $CREDENTIAL_COUNT"
log_message "   • Active workflows: $ACTIVE_WORKFLOW_COUNT"
log_message "   • Data backed up: $DATA_SIZE"
log_message "   • Backup file: $BACKUP_NAME"
log_message "   • Backup size: $BACKUP_SIZE"
log_message "   • Execution time: ${EXECUTION_TIME} seconds"
log_message "   • Status: ✅ SUCCESS"
log_separator
log_message ""
log_message "⏱️  Total execution time: ${EXECUTION_TIME} seconds"
log_message "📝 Log file: $LOG_FILE"
log_separator
log_message "🏁 Backup process completed successfully"
log_separator
