/**
 * Durable Object for persistent job state.
 * Used to coordinate long-running job lifecycle across Worker invocations.
 */
export class JobState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const data = await this.state.storage.get('job') || null;
      return new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (req.method === 'PUT') {
      const job = await req.json();
      await this.state.storage.put('job', job);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  }
}
