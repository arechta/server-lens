#!/usr/bin/env node
// =============================================================================
// flush-bull.js — Conspact (Bull) queue cleanup for redis-pool-1..4
//
// Uses Bull's native queue.clean() API:
//   queue.clean(graceMs, type, limit?)
//   graceMs  : only remove jobs OLDER than this (ms). Default: 1 hour
//   type     : 'completed' | 'failed' | 'active' | 'delayed' | 'wait'
//
// Usage:
//   node flush-bull.js --pool 1
//   node flush-bull.js --pool 1 --grace 7200000   (2 hours)
//   node flush-bull.js --pool 1 --dry-run
//   AUTO_CONFIRM=1 node flush-bull.js --pool 1    (non-interactive, for cron)
// =============================================================================

const Bull = require('bull');

// ── Config ───────────────────────────────────────────────────────────────────
const REDIS_PASSWORD = 'KonstruksiAi&2023';
const BASE_PORT      = 6380; // pool-1=6381, pool-2=6382, ...

// Pool → queue names map (add yours here if different)
const POOL_QUEUES = {
  1: ['helpers', 'notification', 'log', 'optimize-image'],
  2: [],   // auto-discover if empty
  3: [],
  4: [],
};

// ── Args ─────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (flag, fallback) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : fallback; };
const poolNum   = parseInt(getArg('--pool', '0'));
const graceMs   = parseInt(getArg('--grace', String(60 * 60 * 1000))); // 1hr default
const dryRun    = args.includes('--dry-run');
const autoConfirm = process.env.AUTO_CONFIRM === '1';

if (!poolNum || poolNum < 1 || poolNum > 4) {
  console.error('Usage: node flush-bull.js --pool <1-4> [--grace <ms>] [--dry-run]');
  process.exit(1);
}

const redisPort = BASE_PORT + poolNum;
const redisOpts = {
  redis: {
    host: '127.0.0.1',
    port: redisPort,
    password: REDIS_PASSWORD,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function discoverQueues(port) {
  const Redis = require('ioredis');
  const client = new Redis({ host: '127.0.0.1', port, password: REDIS_PASSWORD });
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', 'bull:*:id', 'COUNT', 500);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  await client.quit();
  // Extract queue names from bull:<name>:id
  return [...new Set(keys.map(k => k.replace(/^bull:/, '').replace(/:id$/, '')))];
}

async function getQueueStats(queue) {
  const counts = await queue.getJobCounts();
  return counts;
}

async function isQueueStale(queue, graceMs) {
  // Check most recently completed job's finishedOn timestamp
  const completed = await queue.getCompleted(0, 0); // get most recent 1
  if (!completed.length) return true;
  const lastJob = completed[0];
  const finishedAt = lastJob.finishedOn ?? 0;
  const age = Date.now() - finishedAt;
  return age >= graceMs;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  log(`=== Bull flush: redis-pool-${poolNum} (port ${redisPort}) ===`);
  log(`Grace period : ${graceMs / 1000}s (${graceMs / 3600000}h)`);
  log(`Dry run      : ${dryRun}`);

  // Discover queues if not hardcoded
  let queueNames = POOL_QUEUES[poolNum];
  if (!queueNames.length) {
    log('Auto-discovering queues...');
    queueNames = await discoverQueues(redisPort);
  }

  if (!queueNames.length) {
    log('No queues found. Exiting.');
    process.exit(0);
  }

  log(`Queues found : ${queueNames.join(', ')}`);
  log('');

  const toFlush = [];
  const toSkip  = [];

  // ── Analyze each queue ────────────────────────────────────────────────────
  for (const name of queueNames) {
    const queue = new Bull(name, redisOpts);
    const counts = await getQueueStats(queue);

    // Skip if anything is actively running / waiting
    if ((counts.active ?? 0) > 0 || (counts.waiting ?? 0) > 0 || (counts.delayed ?? 0) > 0) {
      toSkip.push({ name, reason: `active=${counts.active} waiting=${counts.waiting} delayed=${counts.delayed}`, queue });
      continue;
    }

    // Stale check
    const stale = await isQueueStale(queue, graceMs);
    if (!stale) {
      toSkip.push({ name, reason: `last job finished < ${graceMs / 3600000}h ago`, queue });
      continue;
    }

    toFlush.push({ name, counts, queue });
  }

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log('--- Analysis ---');
  for (const { name, counts } of toFlush) {
    console.log(`  ✓ STALE  ${name.padEnd(20)} completed=${counts.completed ?? 0} failed=${counts.failed ?? 0}`);
  }
  for (const { name, reason } of toSkip) {
    console.log(`  ⏭  SKIP   ${name.padEnd(20)} ${reason}`);
  }
  console.log('');

  if (!toFlush.length) {
    log('Nothing to flush.');
    for (const { queue } of toSkip) await queue.close();
    process.exit(0);
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (!dryRun && !autoConfirm) {
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => readline.question('Proceed with flush? [y/N] ', r));
    readline.close();
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
  log('--- Flushing ---');
  for (const { name, queue } of toFlush) {
    try {
      // clean(graceMs, type) — removes jobs older than graceMs
      const [completedRemoved, failedRemoved] = await Promise.all([
        queue.clean(graceMs, 'completed'),
        queue.clean(graceMs, 'failed'),
      ]);
      log(`  ✓ ${name}: removed ${completedRemoved.length} completed, ${failedRemoved.length} failed`);
    } catch (err) {
      log(`  ✗ ${name}: ERROR — ${err.message}`);
    }
    await queue.close();
  }
  for (const { queue } of toSkip) await queue.close();

  log('Done.');
  process.exit(0);
})();
