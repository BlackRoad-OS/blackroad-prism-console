// Projects API: safe FS workspace with Git + LED-aware deploy.
// Env: PROJECTS_DIR (default /srv/projects), ORIGIN_KEY_PATH, DEPLOY_ROOT (/var/www/blackroad/apps)
// Auth: X-BlackRoad-Key (loopback allowed, like other modules)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

module.exports = function attachProjects({ app }) {
  if (!app) throw new Error('projects: need app');

  const BASE = process.env.PROJECTS_DIR || '/srv/projects';
  const DEPLOY_ROOT = process.env.DEPLOY_ROOT || '/var/www/blackroad/apps';
  const originKeyPath = process.env.ORIGIN_KEY_PATH || '/srv/secrets/origin.key';
  let ORIGIN_KEY = ''; try { ORIGIN_KEY = fs.readFileSync(originKeyPath, 'utf8').trim(); } catch {}

  try { fs.mkdirSync(BASE, { recursive: true }); } catch (_) {}
  try { fs.mkdirSync(DEPLOY_ROOT, { recursive: true }); } catch (_) {}

  function guard(req, res, next) {
    const ip = req.socket.remoteAddress || '';
    if (ip.startsWith('127.') || ip === '::1') return next();
    const k = req.get('X-BlackRoad-Key') || '';
    if (ORIGIN_KEY && k === ORIGIN_KEY) return next();
    return res.status(401).json({ error: 'unauthorized' });
  }
  const ok = (res, obj) => res.json(obj);
  const bad = (res, code, msg) => res.status(code).json({ error: msg });

  const slugify = s => (s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  const j = (...p) => path.join(...p);
  const within = (root, p) => {
    const abs = path.resolve(root, p);
    if (!abs.startsWith(path.resolve(root))) throw new Error('path_outside_project');
    return abs;
  };

  function ensureProject(name) {
    const id = slugify(name);
    if (!id) throw new Error('bad_name');
    const root = j(BASE, id);
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    // init meta
    const metaPath = j(root, '.project.json');
    if (!fs.existsSync(metaPath)) fs.writeFileSync(metaPath, JSON.stringify({ id, name, created_at: Date.now() }, null, 2));
    // init git if absent
    if (!fs.existsSync(j(root, '.git'))) {
      spawn('git', ['init'], { cwd: root }).on('close', () => {
        fs.writeFileSync(j(root, '.gitignore'), 'node_modules\n*.log\n.DS_Store\n');
      });
    }
    return { id, root };
  }

  function scanTree(root, rel = '') {
    const dir = within(root, rel);
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      if (name === '.git') continue;
      const p = j(dir, name);
      const stat = fs.statSync(p);
      const entry = { name, path: path.posix.join(rel || '/', name), type: stat.isDirectory() ? 'dir' : 'file', size: stat.size };
      if (stat.isDirectory()) entry.children = scanTree(root, path.posix.join(rel, name));
      out.push(entry);
    }
    return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  async function sendLED(payload) {
    try {
      await fetch('http://127.0.0.1:4000/api/devices/pi-01/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BlackRoad-Key': ORIGIN_KEY },
        body: JSON.stringify(payload)
      });
    } catch {}
  }

  // --- Routes ---
  app.post('/api/projects', guard, (req, res) => {
    let buf=''; req.on('data',d=>buf+=d); req.on('end', ()=>{
      let body={}; try{ body=JSON.parse(buf||'{}'); }catch{}
      try {
        const { id } = ensureProject(body.name || 'project');
        ok(res, { ok:true, id });
      } catch (e) { bad(res, 400, String(e.message||e)); }
    });
  });

  app.get('/api/projects', guard, (req, res) => {
    const list = [];
    for (const name of fs.readdirSync(BASE)) {
      const root = j(BASE, name);
      try {
        const st = fs.statSync(root); if (!st.isDirectory()) continue;
        const meta = JSON.parse(fs.readFileSync(j(root, '.project.json'), 'utf8'));
        list.push({ id: meta.id || name, name: meta.name || name, updated: st.mtimeMs });
      } catch {}
    }
    ok(res, list.sort((a,b)=>b.updated-a.updated));
  });

  app.get('/api/projects/:id/tree', guard, (req,res)=>{
    const id = slugify(req.params.id);
    const root = j(BASE, id);
    if (!fs.existsSync(root)) return bad(res, 404, 'not_found');
    ok(res, scanTree(root, ''));
  });

  app.post('/api/projects/:id/mkdir', guard, (req, res)=>{
    const id = slugify(req.params.id); const root = j(BASE,id);
    if (!fs.existsSync(root)) return bad(res,404,'not_found');
    let buf=''; req.on('data',d=>buf+=d); req.on('end', ()=>{
      let body={}; try{ body=JSON.parse(buf||'{}'); }catch{}
      try {
        const dir = within(root, body.path || '');
        fs.mkdirSync(dir, { recursive: true });
        ok(res, { ok:true });
      } catch(e){ bad(res,400,String(e.message||e)); }
    });
  });

  app.get('/api/projects/:id/file', guard, (req,res)=>{
    const id = slugify(req.params.id); const root = j(BASE,id);
    if (!fs.existsSync(root)) return bad(res,404,'not_found');
    try {
      const fp = within(root, req.query.path || '');
      const data = fs.readFileSync(fp, 'utf8');
      res.type('text/plain').send(data);
    } catch(e){ bad(res,400,String(e.message||e)); }
  });

  app.put('/api/projects/:id/file', guard, (req,res)=>{
    const id = slugify(req.params.id); const root = j(BASE,id);
    if (!fs.existsSync(root)) return bad(res,404,'not_found');
    const target = req.query.path || '';
    let buf=''; req.on('data',d=>buf+=d); req.on('end', ()=>{
      try {
        const fp = within(root, target);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, buf ?? '', 'utf8');
        ok(res,{ ok:true, path: target });
      } catch(e){ bad(res,400,String(e.message||e)); }
    });
  });

  app.delete('/api/projects/:id/file', guard, (req,res)=>{
    const id = slugify(req.params.id); const root = j(BASE,id);
    if (!fs.existsSync(root)) return bad(res,404,'not_found');
    try {
      const fp = within(root, req.query.path || '');
      fs.rmSync(fp, { recursive: true, force: true });
      ok(res,{ ok:true });
    } catch(e){ bad(res,400,String(e.message||e)); }
  });

  app.post('/api/projects/:id/commit', guard, (req,res)=>{
    const id=slugify(req.params.id); const root=j(BASE,id);
    if (!fs.existsSync(root)) return bad(res,404,'not_found');
    let buf=''; req.on('data',d=>buf+=d); req.on('end', ()=>{
      let body={}; try{ body=JSON.parse(buf||'{}'); }catch{}
      const msg = String(body.message || 'Update');
      sendLED({type:'led.emotion', emotion:'busy', ttl_s:30});
      const run = (cmd, args) => new Promise(r=> spawn(cmd,args,{cwd:root}).on('close', code=>r(code)));
      (async ()=>{
        await run('git',['add','-A']);
        const code = await run('git',['commit','-m', msg]);
        if (body.push === true) await run('git',['push']); // requires remote configured
        await sendLED({type: code===0?'led.celebrate':'led.emotion', emotion: code===0?undefined:'error', ttl_s:20});
        ok(res,{ ok:true, code });
      })().catch(e=> bad(res,500,String(e)));
    });
  });

  app.post('/api/projects/:id/deploy', guard, async (req,res)=>{
    try{
      const id = slugify(req.params.id);
      if (!fs.existsSync(j(BASE, id))) return bad(res,404,'not_found');
      const job_id = await app.locals.jobs.start({ project: id, kind:'deploy' });
      ok(res,{ ok:true, job_id });
    }catch(e){ bad(res,500,String(e)); }
  });

  console.log('[projects] mounted at /api/projects  BASE=', BASE);
};
