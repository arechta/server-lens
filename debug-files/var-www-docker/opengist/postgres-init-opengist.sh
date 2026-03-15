#!/bin/bash
# =============================================================
# postgres-init-opengist.sh
# Creates the 'opengist' user and 'opengist' database
# inside the existing running postgres Docker container.
#
# Run this ONCE from the postgres directory:
#   bash /var/www/docker/opengist/postgres-init-opengist.sh
# =============================================================

CONTAINER_NAME="postgres"   # your existing postgres container name
SUPERUSER="konstruksi"      # your postgres superuser
DB_USER="opengist"
DB_PASS="opengist"
DB_NAME="opengist"

echo "▶ Creating user '$DB_USER' in container '$CONTAINER_NAME'..."
docker exec -i "$CONTAINER_NAME" psql -U "$SUPERUSER" <<EOF
-- Create role (skip if already exists)
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE "$DB_USER" WITH LOGIN PASSWORD '$DB_PASS';
    RAISE NOTICE 'Role $DB_USER created.';
  ELSE
    RAISE NOTICE 'Role $DB_USER already exists, skipping.';
  END IF;
END
\$\$;
EOF

echo "▶ Creating database '$DB_NAME' owned by '$DB_USER'..."
docker exec -i "$CONTAINER_NAME" psql -U "$SUPERUSER" <<EOF
SELECT 'CREATE DATABASE "$DB_NAME" OWNER "$DB_USER"'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
EOF

echo "▶ Granting all privileges on '$DB_NAME' to '$DB_USER'..."
docker exec -i "$CONTAINER_NAME" psql -U "$SUPERUSER" <<EOF
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
EOF

echo ""
echo "✅ Done! Database '$DB_NAME' and user '$DB_USER' are ready."
echo "   Connection string: postgres://$DB_USER:$DB_PASS@host.docker.internal:5433/$DB_NAME"
