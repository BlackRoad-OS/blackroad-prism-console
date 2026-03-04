/**
 * BlackRoad CF Job Runner Worker
 *
 * Dispatches and manages long-running GitHub Actions jobs via Cloudflare Workers.
 * Jobs submitted via POST /api/jobs are queued in KV and dispatched to GitHub
 * Actions on a cron schedule. Status is tracked via Durable Objects.
 *
 * Endpoints:
 *   POST /api/jobs         - Enqueue a new job (requires X-Admin-HMAC header)
 *   GET  /api/jobs         - List queued/running/done jobs (requires X-Admin-HMAC)
 *   GET  /api/jobs/:id     - Get status of a specific job (requires X-Admin-HMAC)
 *   DELETE /api/jobs/:id   - Cancel a pending job (requires X-Admin-HMAC)
 *   GET  /health           - Public health check
 *
 * Environment variables (set in wrangler.toml or CF dashboard):
 *   GITHUB_TOKEN    - GitHub PAT with `workflow` scope (secret)
 *   GITHUB_REPO     - "owner/repo" (var)
 *   ADMIN_HMAC      - shared secret for request auth (secret)
 *   GITHUB_API_URL  - GitHub API base (var, default https://api.github.com)
 */

export { JobState } from './job_state.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-admin-hmac',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};

export default {
  /**
   * HTTP handler for incoming requests.
   */
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      return json({ status: 'ok', ts: new Date().toISOString() });
    }

    // All other routes require auth
    if (!(await checkAdmin(req, env))) {
      return json({ error: 'forbidden' }, 403);
    }

    try {
      if (url.pathname === '/api/jobs' && req.method === 'POST') {
        return handleEnqueue(req, env);
      }
      if (url.pathname === '/api/jobs' && req.method === 'GET') {
        return handleListJobs(env);
      }
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)$/);
      if (jobMatch) {
        const id = jobMatch[1];
        if (req.method === 'GET') return handleJobStatus(id, env);
        if (req.method === 'DELETE') return handleCancelJob(id, env);
      }
    } catch (e) {
      console.error('CF Worker error', e);
      return json({ error: 'internal error', message: e.message }, 500);
    }

    return json({ error: 'not found' }, 404);
  },

  /**
   * Scheduled handler — processes the job queue every minute.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processQueue(env));
  },
};

/* ─── Job enqueueing ─────────────────────────────────────────────────────── */

async function handleEnqueue(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || !body.workflow) {
    return json({ error: 'workflow field required' }, 400);
  }

  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    workflow: body.workflow,        // e.g. "ci.yml" or full workflow file name
    ref: body.ref || 'main',
    inputs: body.inputs || {},
    status: 'pending',
    created: new Date().toISOString(),
    run_id: null,
    run_url: null,
    updated: new Date().toISOString(),
  };

  await env.JOB_QUEUE.put(`job:${id}`, JSON.stringify(job), {
    // Keep completed jobs for 7 days
    expirationTtl: 60 * 60 * 24 * 7,
  });

  return json({ id, status: 'pending', message: 'job enqueued' }, 201);
}

/* ─── Job listing ────────────────────────────────────────────────────────── */

async function handleListJobs(env) {
  const keys = await env.JOB_QUEUE.list({ prefix: 'job:' });
  const jobs = await Promise.all(
    keys.keys.map(async (k) => {
      const v = await env.JOB_QUEUE.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );
  return json({ jobs: jobs.filter(Boolean) });
}

/* ─── Job status ─────────────────────────────────────────────────────────── */

async function handleJobStatus(id, env) {
  const v = await env.JOB_QUEUE.get(`job:${id}`);
  if (!v) return json({ error: 'not found' }, 404);
  return json(JSON.parse(v));
}

/* ─── Job cancellation ───────────────────────────────────────────────────── */

async function handleCancelJob(id, env) {
  const v = await env.JOB_QUEUE.get(`job:${id}`);
  if (!v) return json({ error: 'not found' }, 404);
  const job = JSON.parse(v);
  if (job.status !== 'pending') {
    return json({ error: `cannot cancel job in status '${job.status}'` }, 409);
  }
  job.status = 'cancelled';
  job.updated = new Date().toISOString();
  await env.JOB_QUEUE.put(`job:${id}`, JSON.stringify(job), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
  return json({ id, status: 'cancelled' });
}

/* ─── Queue processor (cron) ────────────────────────────────────────────── */

async function processQueue(env) {
  const keys = await env.JOB_QUEUE.list({ prefix: 'job:' });

  for (const k of keys.keys) {
    const v = await env.JOB_QUEUE.get(k.name);
    if (!v) continue;
    const job = JSON.parse(v);

    if (job.status === 'pending') {
      await dispatchJob(job, env);
    } else if (job.status === 'running' && job.run_id) {
      await syncJobStatus(job, env);
    }
  }
}

/* ─── Dispatch a pending job to GitHub Actions ───────────────────────────── */

async function dispatchJob(job, env) {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN not set — cannot dispatch jobs');
    return;
  }

  const repo = env.GITHUB_REPO || 'BlackRoad-OS/blackroad-prism-console';
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
  const url = `${apiBase}/repos/${repo}/actions/workflows/${encodeURIComponent(job.workflow)}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'blackroad-cf-job-runner/1.0',
    },
    body: JSON.stringify({ ref: job.ref, inputs: job.inputs }),
  });

  if (res.status === 204) {
    // Dispatch accepted — we don't know the run_id yet; mark as dispatched
    job.status = 'dispatched';
    job.dispatched = new Date().toISOString();
    job.updated = new Date().toISOString();
    console.log(`Dispatched job ${job.id} → ${job.workflow}@${job.ref}`);
  } else {
    const body = await res.text();
    job.status = 'error';
    job.error = `GitHub dispatch returned ${res.status}: ${body.slice(0, 200)}`;
    job.updated = new Date().toISOString();
    console.error(`Failed to dispatch job ${job.id}: ${job.error}`);
  }

  await env.JOB_QUEUE.put(`job:${job.id}`, JSON.stringify(job), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
}

/* ─── Sync a running job's status from GitHub Actions ────────────────────── */

async function syncJobStatus(job, env) {
  const token = env.GITHUB_TOKEN;
  if (!token) return;

  const repo = env.GITHUB_REPO || 'BlackRoad-OS/blackroad-prism-console';
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
  const url = `${apiBase}/repos/${repo}/actions/runs/${job.run_id}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'blackroad-cf-job-runner/1.0',
    },
  });

  if (!res.ok) return;
  const data = await res.json();

  const prevStatus = job.status;
  job.run_url = data.html_url;
  job.updated = new Date().toISOString();

  if (data.status === 'completed') {
    job.status = data.conclusion === 'success' ? 'success' : 'failed';
    job.conclusion = data.conclusion;
    job.completed = new Date().toISOString();
  } else {
    job.status = 'running';
  }

  if (job.status !== prevStatus) {
    console.log(`Job ${job.id} status: ${prevStatus} → ${job.status}`);
  }

  await env.JOB_QUEUE.put(`job:${job.id}`, JSON.stringify(job), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

async function checkAdmin(req, env) {
  const secret = env.ADMIN_HMAC;
  if (!secret) return false;
  const sig =
    req.headers.get('X-Admin-HMAC') || req.headers.get('x-admin-hmac');
  if (!sig) return false;
  // Constant-time comparison
  if (sig.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}
