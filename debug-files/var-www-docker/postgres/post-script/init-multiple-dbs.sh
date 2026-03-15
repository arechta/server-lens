#!/bin/bash
set -e

# This script reads the list of databases from config.json and creates them if they don't exist.

# --- 1. DEFINE FILE LOCATIONS ---
# The script expects config.json to be in the root of the volume mount: /config.json
CONFIG_FILE="/config.json"

# Check if jq is available (it should be, via the Dockerfile)
if ! command -v jq &> /dev/null
then
    echo "Error: 'jq' tool is not found. Please ensure it is installed in the Dockerfile."
    exit 1
fi

# --- 2. LOAD DATABASES FROM JSON ---
echo "Loading database list from $CONFIG_FILE"
# Use 'jq' to extract the array of database names
DATABASES=$(jq -r '.databases[]' "$CONFIG_FILE")

# Check if the list is empty
if [ -z "$DATABASES" ]; then
    echo "Warning: No databases found in $CONFIG_FILE. Skipping creation."
    exit 0
fi

# --- 3. WAIT FOR POSTGRES TO BE READY ---
echo "Waiting for PostgreSQL to be available before running initialization script..."
until pg_isready -U "$POSTGRES_USER"; do
  sleep 1
done
echo "PostgreSQL is available. Running database creation checks..."

# --- 4. LOOP AND CREATE DATABASES CONDITIONALLY ---
# Loop over the list of databases retrieved by jq
for DB_NAME in $DATABASES; do
    echo "Checking/Creating database: $DB_NAME"

    # Set PGPASSWORD explicitly for the psql command for maximum reliability
    PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_USER" <<-EOSQL
        -- Check if the database exists. If it does NOT exist, the command is executed.
        SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$POSTGRES_USER"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
EOSQL
    echo "Database $DB_NAME creation/check complete."
done

echo "Flexible database initialization finished successfully."
