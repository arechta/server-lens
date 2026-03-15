#!/bin/bash
# =============================================================================
# setup.sh — Install deps and cron jobs
# Run once: bash /var/www/redis/scripts/setup.sh
# =============================================================================

SCRIPT_DIR="/var/www/docker/redis/scripts"
LOG_DIR="/var/log/redis-flush"

echo "→ Installing npm dependencies..."
cd "$SCRIPT_DIR"
npm install --omit=dev

echo "→ Creating log directory..."
mkdir -p "$LOG_DIR"

echo "→ Installing cron jobs..."
# Remove existing redis-flush entries
crontab -l 2>/dev/null | grep -v "flush-bull" > /tmp/crontab_clean || true

cat >> /tmp/crontab_clean << CRON

# ── Redis Flush Jobs ──────────────────────────────────────────────────────────
# Pools 1-4 (Conspact / Bull) — stale-aware, every 6 hours
0 */6 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bull.js --pool 1 >> /var/log/redis-flush/pool-1.log 2>&1
0 */6 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bull.js --pool 2 >> /var/log/redis-flush/pool-2.log 2>&1
0 */6 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bull.js --pool 3 >> /var/log/redis-flush/pool-3.log 2>&1
0 */6 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bull.js --pool 4 >> /var/log/redis-flush/pool-4.log 2>&1

# Pools 5-10 (Consdoc / BullMQ) — stale-aware, every day at 3 AM
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 5  >> /var/log/redis-flush/pool-5.log 2>&1
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 6  >> /var/log/redis-flush/pool-6.log 2>&1
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 7  >> /var/log/redis-flush/pool-7.log 2>&1
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 8  >> /var/log/redis-flush/pool-8.log 2>&1
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 9  >> /var/log/redis-flush/pool-9.log 2>&1
0 3 * * * AUTO_CONFIRM=1 node /var/www/docker/redis/scripts/flush-bullmq.js --pool 10 >> /var/log/redis-flush/pool-10.log 2>&1
CRON

crontab /tmp/crontab_clean
rm /tmp/crontab_clean

echo "Done. Cron jobs installed:"
crontab -l | grep "flush-bull"
