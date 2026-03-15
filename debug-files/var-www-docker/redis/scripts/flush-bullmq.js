#!/usr/bin/env node
// =============================================================================
// flush-bullmq.js — Consdoc (BullMQ) queue cleanup for redis-pool-5..10
//
// Uses BullMQ's native queue.clean() API:
//   queue.clean(graceMs, limit, type)
//   ⚠️  Note: BullMQ has DIFFERENT param order vs Bull!
//   graceMs  : only remove jobs OLDER than this (ms). Default: 1 hour
//   limit    : max jobs to remove per call (0 = no limit)
//   type     : 'completed' | 'failed' | 'active' | 'delayed' | 'wait' | 'paused'
//
// ⚠️  Multi-DB aware: Consdoc services use separate Redis databases per service
//     (db0=app cache, db1=auth queues, db2=base queues, db3=document queues, etc.)
//     This script scans ALL databases and handles each queue on its correct db.
//
// Usage:
//   node flush-bullmq.js --pool 5
//   node flush-bullmq.js --pool 5 --grace 7200000   (2 hours)
//   node flush-bullmq.js --pool 5 --limit 5000       (max 5000 jobs per run)
//   node flush-bullmq.js --pool 5 --dry-run
//   AUTO_CONFIRM=1 node flush-bullmq.js --pool 5     (non-interactive, for cron)
// =============================================================================

const { Queue } = require('bullmq');
const Redis     = require('ioredis');

// ── Config ───────────────────────────────────────────────────────────────────
const REDIS_PASSWORD = 'KonstruksiAi&2023';
const BASE_PORT      = 6380; // pool-1=6381, ..., pool-10=6390
const MAX_DBS        = 16;   // scan db0 through db15

// ── Args ─────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const getArg      = (flag, fallback) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : fallback; };
const poolNum     = parseInt(getArg('--pool',  '0'));
const graceMs     = parseInt(getArg('--grace', String(60 * 60 * 1000))); // 1hr default
const limit       = parseInt(getArg('--limit', '0')); // 0 = unlimited
const dryRun      = args.includes('--dry-run');
const autoConfirm = process.env.AUTO_CONFIRM === '1';

if (!poolNum || poolNum < 5 || poolNum > 10) {
  console.error('Usage: node flush-bullmq.js --pool <5-10> [--grace <ms>] [--limit <n>] [--dry-run]');
  process.exit(1);
}

const redisPort = BASE_PORT + poolNum;
const baseConn  = { host: '127.0.0.1', port: redisPort, password: REDIS_PASSWORD };

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ── Discover queues across all databases ──────────────────────────────────────
// Returns: [{ name, db }]
async function discoverAllDbs(port) {
  const found = [];

  for (let db = 0; db < MAX_DBS; db++) {
    const client = new Redis({ ...baseConn, db, lazyConnect: true });
    try {
      await client.connect();

      const dbSize = await client.dbsize();
      if (dbSize === 0) {
        await client.quit();
        continue;
      }

      // Scan for BullMQ queue marker keys (bull:<queue>:meta)
      const keys = [];
      let cursor = '0';
      do {
        const [next, batch] = await client.scan(cursor, 'MATCH', 'bull:*:meta', 'COUNT', 500);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');

      if (keys.length) {
        const queueNames = [...new Set(keys.map(k => k.replace(/^bull:/, '').replace(/:meta$/, '')))];
        for (const name of queueNames) {
          found.push({ name, db });
          log(`  db${db}: found queue "${name}"`);
        }
      }
    } catch (err) {
      // db doesn't exist or unavailable — skip
    } finally {
      try { await client.quit(); } catch {}
    }
  }

  return found;
}

// ── Stale check ───────────────────────────────────────────────────────────────
async function isQueueStale(queue, graceMs) {
  const completed = await queue.getCompleted(0, 0);
  if (!completed.length) return true;
  const finishedAt = completed[0].finishedOn ?? 0;
  return (Date.now() - finishedAt) >= graceMs;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  log(`=== BullMQ flush: redis-pool-${poolNum} (port ${redisPort}) ===`);
  log(`Grace period : ${graceMs / 1000}s (${graceMs / 3600000}h)`);
  log(`Limit        : ${limit === 0 ? 'unlimited' : limit} jobs per type`);
  log(`Dry run      : ${dryRun}`);
  log(`Scanning db0..db${MAX_DBS - 1} for BullMQ queues...`);
  log('');

  const discovered = await discoverAllDbs(redisPort);

  if (!discovered.length) {
    log('No BullMQ queues found across any database. Exiting.');
    process.exit(0);
  }

  log('');
  log(`Total queues found: ${discovered.length}`);
  log('');

  const toFlush = [];
  const toSkip  = [];

  // ── Analyze each queue ────────────────────────────────────────────────────
  for (const { name, db } of discovered) {
    const conn  = { ...baseConn, db };
    const queue = new Queue(name, { connection: conn });

    const [active, waiting, delayed, completed, failed] = await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount(),
      queue.getDelayedCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    const label = `db${db}:${name}`;

    // Skip if live work is present
    if (active > 0 || waiting > 0 || delayed > 0) {
      toSkip.push({ label, reason: `active=${active} waiting=${waiting} delayed=${delayed}`, queue });
      continue;
    }

    // Stale check
    const stale = await isQueueStale(queue, graceMs);
    if (!stale) {
      toSkip.push({ label, reason: `last job finished < ${graceMs / 3600000}h ago`, queue });
      continue;
    }

    toFlush.push({ label, name, db, completed, failed, queue });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('--- Analysis ---');
  for (const { label, completed, failed } of toFlush) {
    console.log(`  ✓ STALE  ${label.padEnd(36)} completed=${completed} failed=${failed}`);
  }
  for (const { label, reason } of toSkip) {
    console.log(`  ⏭  SKIP   ${label.padEnd(36)} ${reason}`);
  }
  console.log('');

  if (!toFlush.length) {
    log('Nothing to flush.');
    for (const { queue } of toSkip) await queue.close();
    process.exit(0);
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (!dryRun && !autoConfirm) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question('Proceed with flush? [y/N] ', r));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      log('Aborted.');
      for (const { queue } of [...toFlush, ...toSkip]) await queue.close();
      process.exit(0);
    }
  }

  if (dryRun) {
    log('Dry run — no changes made.');
    for (const { queue } of [...toFlush, ...toSkip]) await queue.close();
    process.exit(0);
  }

  // ── Flush ─────────────────────────────────────────────────────────────────
  // BullMQ clean() signature: clean(graceMs, limit, type)  ⚠️ different from Bull
  log('--- Flushing ---');
  for (const { label, queue } of toFlush) {
    try {
      const [completedRemoved, failedRemoved] = await Promise.all([
        queue.clean(graceMs, limit, 'completed'),
        queue.clean(graceMs, limit, 'failed'),
      ]);
      log(`  ✓ ${label}: removed ${completedRemoved.length} completed, ${failedRemoved.length} failed`);
    } catch (err) {
      log(`  ✗ ${label}: ERROR — ${err.message}`);
    }
    await queue.close();
  }
  for (const { queue } of toSkip) await queue.close();

  log('Done.');
  process.exit(0);
})();
