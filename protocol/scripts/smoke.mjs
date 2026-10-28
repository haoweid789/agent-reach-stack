/**
 * End-to-end smoke test.
 *
 * Exercises the real agent-reach CLI through the SDK, plus the A2A server
 * over HTTP. Run with: node scripts/smoke.mjs
 */

import { ReachClient, ReachError } from '@agent-reach/sdk';

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
}

// ---------------------------------------------------------------
// 1. CLI transport: list channels
// ---------------------------------------------------------------
const reach = new ReachClient({ mode: 'cli' });

try {
  const listed = await reach.listChannels();
  record('CLI listChannels ok', listed.ok, listed.error?.message ?? '');
} catch (error) {
  record('CLI listChannels ok', false, ReachError.from(error).message);
}

// ---------------------------------------------------------------
// 2. CLI transport: execute a real action (GitHub search)
// ---------------------------------------------------------------
try {
  const search = await reach.execute('github', 'search', { query: 'react hooks', limit: 3 });
  const count = search.items?.length ?? 0;
  record(
    'CLI github search returns items',
    search.ok && count > 0,
    search.ok ? `${count} items` : search.error?.message ?? ''
  );

  if (count > 0) {
    const first = search.items[0];
    console.log(`       first: ${first.title} -> ${first.url}`);
  }
} catch (error) {
  record('CLI github search returns items', false, ReachError.from(error).message);
}

// ---------------------------------------------------------------
// 3. CLI transport: unknown channel is rejected locally
// ---------------------------------------------------------------
{
  const bad = await reach.execute('definitely-not-a-channel', 'search', { query: 'x' });
  record(
    'unknown channel rejected without spawning',
    !bad.ok && bad.error?.code === 'UNKNOWN_CHANNEL',
    bad.error?.code ?? ''
  );
}

// ---------------------------------------------------------------
// 4. A2A transport: start the server and talk to it over HTTP
// ---------------------------------------------------------------
const a2aBase = 'http://localhost:8099';

try {
  const { spawn } = await import('node:child_process');
  const server = spawn(process.execPath, ['dist/a2a-server.js'], {
    env: { ...process.env, PORT: '8099', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverErr = '';
  server.stderr.on('data', d => { serverErr += d.toString(); });

  // Wait for the server to come up.
  let up = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`${a2aBase}/health`);
      if (res.ok) { up = true; break; }
    } catch {
      // not ready yet
    }
  }

  if (!up) {
    record('A2A server starts', false, serverErr.slice(0, 200) || 'health check timeout');
  } else {
    record('A2A server starts', true, `${a2aBase}`);

    const a2a = new ReachClient({ mode: 'a2a', baseUrl: a2aBase });

    // Agent Card
    const card = await a2a.listChannels();
    record('A2A agent card lists skills', card.ok && (card.items?.length ?? 0) > 0,
      `${card.items?.length ?? 0} skills`);

    // Real task over JSON-RPC
    const task = await a2a.execute('github', 'search', { query: 'agent-reach', limit: 2 });
    const taskCount = task.items?.length ?? 0;
    record('A2A task executes and returns items', task.ok && taskCount > 0,
      task.ok ? `${taskCount} items` : task.error?.message ?? '');

    if (taskCount > 0) {
      console.log(`       first: ${task.items[0].title}`);
    }
  }

  server.kill('SIGTERM');
} catch (error) {
  record('A2A server starts', false, ReachError.from(error).message);
}

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
const failed = results.filter(r => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) {
  process.exit(1);
}
