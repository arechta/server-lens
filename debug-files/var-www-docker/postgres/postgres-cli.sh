#!/bin/bash

# postgres-cli.sh: Command-Line Interface for managing databases in the Docker 'postgres' container.
#
# Usage:
#   ./postgres-cli.sh create database <database_name>
#   ./postgres-cli.sh drop database <database_name>

set -e

# --- Configuration ---
CONTAINER_NAME="postgres"
ENV_FILE=".env"
# The system database to connect to when performing administrative tasks
ADMIN_DB="template1" 

# --- Function to safely extract a variable's value from .env ---
get_env_value() {
    local VAR_NAME=$1
    # Use grep to find the variable, then sed to strip comments, quotes, and whitespace.
    grep "^$VAR_NAME=" "$ENV_FILE" | head -1 | sed -e "s/^$VAR_NAME=//" -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/'//g" -e 's/"//g'
}

# --- Function to initialize credentials ---
get_creds() {
    # Check if the container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
        echo "Error: Container '$CONTAINER_NAME' is not running. Please run 'docker compose up -d' first." >&2
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        echo "Error: .env file not found at $ENV_FILE" >&2
        exit 1
    fi

    # Read credentials using the safe function
    export DB_USER=$(get_env_value POSTGRES_USER)
    export DB_PASSWORD=$(get_env_value POSTGRES_PASSWORD)
    
    # Check if necessary credentials were read
    if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        echo "Error: POSTGRES_USER or POSTGRES_PASSWORD not found or empty in $ENV_FILE" >&2
        exit 1
    fi

    # Set PGPASSWORD environment variable for psql command
    export PGPASSWORD="$DB_PASSWORD"
    # Escaped user for safe insertion into SQL strings (if needed, though standard quotes should suffice)
    export DB_USER_ESCAPED="$(echo "$DB_USER" | sed "s/'/''/g")"
}

# --- Core Database Functions ---

drop_database() {
    local DB_NAME=$1
    echo "Attempting to drop database: $DB_NAME"
    
    # Use the PGPASSWORD environment variable set in get_creds
    docker exec -t "$CONTAINER_NAME" psql -U "$DB_USER" -d "$ADMIN_DB" -c "DROP DATABASE IF EXISTS \"$DB_NAME\""

    if [ $? -eq 0 ]; then
        echo "Success: Database '$DB_NAME' has been dropped (if it existed)."
    else
        echo "Error: Failed to drop database '$DB_NAME'." >&2
    fi
}

create_database() {
    local DB_NAME=$1
    echo "Attempting to create database: $DB_NAME"

    # Conditional SQL using the strict NOT EXISTS clause
    SQL="SELECT 'CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec"

    # Use the PGPASSWORD environment variable set in get_creds
    docker exec -t "$CONTAINER_NAME" psql -U "$DB_USER" -d "$ADMIN_DB" -c "$SQL"

    if [ $? -eq 0 ]; then
        echo "Success: Database '$DB_NAME' created or already existed."
    else
        echo "Error: Failed to create database '$DB_NAME'." >&2
    fi
}

# --- Main Logic ---

# 1. Check if arguments are provided
if [ $# -lt 3 ]; then
    echo "Usage: ./postgres-cli.sh <create|drop> database <database_name>"
    echo "Example: ./postgres-cli.sh create database new_project_db"
    exit 1
fi

ACTION=$1
TARGET=$2
DB_NAME=$3

# 2. Get credentials before proceeding
get_creds

# 3. Handle commands
case "$ACTION" in
    "create")
        if [ "$TARGET" == "database" ]; then
            create_database "$DB_NAME"
        else
            echo "Invalid target: '$TARGET'. Use 'database'." >&2
            exit 1
        fi
        ;;
    "drop")
        if [ "$TARGET" == "database" ]; then
            drop_database "$DB_NAME"
        else
            echo "Invalid target: '$TARGET'. Use 'database'." >&2
            exit 1
        fi
        ;;
    *)
        echo "Invalid action: '$ACTION'. Use 'create' or 'drop'." >&2
        exit 1
        ;;
esac

