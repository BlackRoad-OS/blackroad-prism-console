// Jobs v2: precise progress markers, hard cancel, weighted pipelines, SSE logs.
//
// Endpoints
// POST /api/jobs/start  {project, kind: 'test'|'build'|'deploy'|'custom'|'pipeline', script?, cmd?, args?, env?}
// GET  /api/jobs/:id
// GET  /api/jobs/:id/events     (SSE: log|progress|state|stage)
// GET  /api/jobs?project=<id>
// POST /api/jobs/:id/cancel
//
// Pipeline file (per project): /srv/projects/<id>/.blackroad/pipeline.yaml
// Example:
// steps:
//   - name: install   # weight defaults to even split if omitted
//     cmd: npm ci
//     weight: 20
//   - name: test
//     cmd: npm test
//     weight: 30
//   - name: build
//     cmd: npm run build
//     weight: 30
//   - name: deploy
//     cmd: ./scripts/deploy.sh
//     weight: 20
// on_error: stop   # or 'continue'
// env: { NODE_ENV: production }

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs'); const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const YAML = require('yaml');

const DB_PATH = process.env.DB_PATH || '/srv/blackroad-api/blackroad.db';
const PROJECTS_DIR = process.env.PROJECTS_DIR || '/srv/projects';
const ORIGIN_KEY_PATH = process.env.ORIGIN_KEY_PATH || '/srv/secrets/origin.key';
const DEPLOY_ROOT = process.env.DEPLOY_ROOT || '/var/www/blackroad/apps';

function db(){ return new sqlite3.Database(DB_PATH); }
function run(db, sql, p=[]) { return new Promise((r,j)=>db.run(sql,p,function(e){e?j(e):r(this)})); }
function all(db, sql, p=[]) { return new Promise((r,j)=>db.all(sql,p,(e,x)=>e?j(e):r(x))); }
function get(db, sql, p=[]) { return new Promise((r,j)=>db.get(sql,p,(e,x)=>e?j(e):r(x))); }
function now(){ return Math.floor(Date.now()/1000); }
function orKey(){ try{ return fs.readFileSync(ORIGIN_KEY_PATH,'utf8').trim(); }catch{return ''} }
async function led(payload){
  try{
    await fetch('http://127.0.0.1:4000/api/devices/pi-01/command',{
      method:'POST', headers:{'Content-Type':'application/json','X-BlackRoad-Key': orKey()},
      body: JSON.stringify(payload)
    });
  }catch{}
}
function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }

// progress parser
function parseProgressLine(line){
  // [[PROGRESS 42]] or [[PROGRESS 42%]] or [[PROGRESS 0.42]]
  const m = line.match(/\[\[\s*PROGRESS\s+([0-9.]+)%?\s*\]\]/i);
  if (m){ const v = parseFloat(m[1]); return (v > 1.0 ? v/100 : v); }
  // JSON line: {"progress":0.42} or {"progress":42}
  try{
    if (line[0]==='{' && line.includes('progress')){
      const j = JSON.parse(line);
      if (typeof j.progress === 'number'){ const v = j.progress; return (v > 1.0 ? v/100 : v); }
    }
  }catch{}
  return null;
}
function parseStageLine(line){
  // [[STAGE name=<txt> weight=<num> start]] or [[STAGE name=build done]]
  const m = line.match(/\[\[\s*STAGE\s+(.+?)\s*\]\]/i);
  if (!m) return null;
  const toks = Object.fromEntries(
    m[1].split(/\s+/).filter(Boolean).map(kv=>{
      const p = kv.split('='); return [p[0], p[1]===undefined? true : p[1]];
    })
  );
  return toks; // {name, weight?, start?|done?|error?}
}

// process registry for cancel()
const PROCS = new Map(); // job_id -> { child, pgid }

module.exports = function attachJobs({ app }){
  const d = db();
  const clients = new Map(); // job_id -> Set(res)

  async function appendEvent(job_id, type, data){
    const row = await get(d, `SELECT max(seq)+1 AS n FROM job_events WHERE job_id=?`, [job_id]);
    const seq = row && row.n ? row.n : 1;
    await run(d, `INSERT INTO job_events (job_id,seq,ts,type,data) VALUES (?,?,?,?,?)`,
                 [job_id, seq, now(), type, (typeof data==='string'?data:JSON.stringify(data))]);
    // fan out SSE
    const set = clients.get(job_id); if (!set) return;
    const line = `event: ${type}\ndata: ${typeof data==='string'?data:JSON.stringify(data)}\n\n`;
    for (const res of set){ try{ res.write(line); }catch{} }
  }
  async function updateJob(job_id, patch){
    const j = await get(d, `SELECT * FROM jobs WHERE job_id=?`, [job_id]);
    if (!j) return;
    const status   = patch.status   ?? j.status;
    const progress = (patch.progress!=null) ? clamp01(patch.progress) : j.progress;
    const exit_code= (patch.exit_code!=null) ? patch.exit_code : j.exit_code;
    const finished = (patch.finished_at!=null) ? patch.finished_at : j.finished_at;
    const pid      = (patch.pid!=null) ? patch.pid : j.pid;
    await run(d, `UPDATE jobs SET status=?, progress=?, exit_code=?, finished_at=?, pid=? WHERE job_id=?`,
                 [status, progress, exit_code, finished, pid, job_id]);
    if (patch.progress!=null) await appendEvent(job_id, 'progress', {progress});
    if (patch.status)         await appendEvent(job_id, 'state', {status});
  }

  function spawnTracked(job_id, cmd, args, opts){
    // Create a new process group for clean cancellation
    const child = spawn(cmd, args, { ...opts, detached: true });
    const pgid = child.pid; // send signals to -pgid
    PROCS.set(job_id, { child, pgid });
    return child;
  }

  async function runSingle(job_id, child){
    let lastPct = 0;
    child.on('error', async err=>{
      await appendEvent(job_id, 'log', `\n[error] spawn failed: ${String(err)}\n`);
      await updateJob(job_id, { status:'error', finished_at: now() });
      PROCS.delete(job_id);
      await led({type:'led.emotion', emotion:'error', ttl_s:20});
    });
    child.stdout.on('data', async (buf)=>{
      const s = buf.toString();
      await appendEvent(job_id, 'log', s);
      // progress markers
      for (const line of s.split(/\r?\n/)){
        const p = parseProgressLine(line);
        if (p!=null && Math.abs(p-lastPct) >= 0.01){
          lastPct = clamp01(p);
          await updateJob(job_id, {progress: lastPct});
          await led({type:'led.progress', pct: Math.round(lastPct*100), ttl_s:90});
        }
      }
    });
    child.stderr.on('data', async buf=> { await appendEvent(job_id, 'log', buf.toString()); });
    child.on('close', async code=>{
      const ok = (code===0);
      await updateJob(job_id, { status: ok?'ok':'error', progress: ok?1:lastPct, exit_code: code, finished_at: now() });
      await appendEvent(job_id, 'log', `\n[exit ${code}]\n`);
      PROCS.delete(job_id);
      if (ok) await led({type:'led.celebrate', ttl_s:20}); else await led({type:'led.emotion', emotion:'error', ttl_s:20});
    });
  }

  async function runPipeline(job_id, project, env){
    const root = path.join(PROJECTS_DIR, project);
    const pfile = path.join(root, '.blackroad', 'pipeline.yaml');
    let pipe = { steps: [], on_error: 'stop', env:{} };
    if (fs.existsSync(pfile)){
      pipe = YAML.parse(fs.readFileSync(pfile, 'utf8')) || pipe;
    } else {
      // fallback minimal pipeline: build then deploy static public/
      pipe = {
        steps: [
          { name:'build',  cmd:'npm run build || true', weight: 60 },
          { name:'deploy', cmd:`mkdir -p ${DEPLOY_ROOT}/${project} && rsync -a --delete public/ ${DEPLOY_ROOT}/${project}/`, weight: 40 }
        ],
        on_error: 'stop'
      };
    }
    const steps = pipe.steps || [];
    const weights = steps.map(s=> Number(s.weight) || 0);
    const sum = weights.reduce((a,b)=>a+b, 0);
    if (sum <= 0){
      // even weights if none provided
      const w = 100.0 / Math.max(1, steps.length);
      for (let i=0;i<steps.length;i++) steps[i].weight = w;
    }
    let base = 0; // cumulative %
    for (let i=0;i<steps.length;i++){
      const step = steps[i];
      const w = (Number(step.weight)||0);
      // announce stage start
      await appendEvent(job_id, 'stage', {name: step.name||`step-${i+1}`, index:i+1, total: steps.length, status:'start'});
      await updateJob(job_id, {progress: clamp01(base/100)});
      await led({type:'led.progress', pct: Math.round(base), ttl_s:180});

      // NOTE: step.cmd comes from project-controlled pipeline.yaml files only;
      // pipeline.yaml must not be writable by untrusted users.
      const child = spawnTracked(job_id, '/bin/bash', ['-c', step.cmd], { cwd: root, env: { ...process.env, ...(pipe.env||{}), ...env }, shell:false });

      let within = 0;
      const handleChunk = async (chunk)=>{
        const text = chunk.toString();
        await appendEvent(job_id, 'log', text);
        for (const line of text.split(/\r?\n/)){
          const stageTok = parseStageLine(line);
          if (stageTok && stageTok.name){
            await appendEvent(job_id, 'stage', {name: stageTok.name, index:i+1, total: steps.length, status: stageTok.done?'done': (stageTok.error?'error':'start')});
          }
          const p = parseProgressLine(line);
          if (p!=null){
            within = clamp01(p);
            const overall = clamp01((base + w*within)/100);
            await updateJob(job_id, {progress: overall});
            await led({type:'led.progress', pct: Math.round(overall*100), ttl_s:90});
          }
        }
      };
      child.stdout.on('data', handleChunk);
      child.stderr.on('data', handleChunk);

      const code = await new Promise(resolve => child.on('close', resolve));
      PROCS.delete(job_id);

      if (code !== 0){
        await appendEvent(job_id, 'stage', {name: step.name||`step-${i+1}`, index:i+1, total: steps.length, status:'error', exit:code});
        if ((pipe.on_error||'stop') === 'stop'){
          await updateJob(job_id, {status:'error', exit_code: code, finished_at: now()});
          await led({type:'led.emotion', emotion:'error', ttl_s:20});
          return;
        }
      } else {
        await appendEvent(job_id, 'stage', {name: step.name||`step-${i+1}`, index:i+1, total: steps.length, status:'ok'});
      }
      base += w;
    }
    await updateJob(job_id, {status:'ok', progress:1, finished_at: now()});
    await led({type:'led.celebrate', ttl_s:20});
  }

  async function startJob(body){
    const project = (body.project || '').toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
    const kind = body.kind || 'custom';
    const id = 'job-'+uuidv4();
    const cwd = body.cwd || path.join(PROJECTS_DIR, project);
    let cmd = body.cmd, args = body.args || [];
    const env = body.env || {};

    if (!fs.existsSync(cwd)) throw new Error('project not found');

    // derive defaults
    if (!cmd && kind!=='custom' && kind!=='pipeline'){
      if (kind==='deploy'){
        if (fs.existsSync(path.join(cwd, 'scripts/deploy.sh'))){
          cmd = '/bin/bash'; args = ['-c','bash scripts/deploy.sh'];
        } else {
          cmd = '/bin/bash'; args = ['-c', `mkdir -p ${DEPLOY_ROOT}/${project} && rsync -a --delete public/ ${DEPLOY_ROOT}/${project}/`];
        }
      } else if (kind==='test'){
        cmd = '/bin/bash'; args = ['-c', 'npm test || echo "no tests"'];
      } else if (kind==='build'){
        cmd = '/bin/bash'; args = ['-c', 'npm run build || echo "no build"'];
      }
    }
    if (kind==='custom' && !cmd && body.script){
      cmd = '/bin/bash'; args = ['-c', body.script];
    }

    if (kind!=='pipeline' && !cmd){
      throw new Error('missing command for job');
    }

    let child = null;
    try {
      if (kind !== 'pipeline'){
        child = spawnTracked(id, cmd, args, { cwd, env: { ...process.env, ...env }, shell:false });
      }

      await run(d, `INSERT INTO jobs (job_id,project_id,kind,cmd,args_json,env_json,status,progress,started_at,pid)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [id, project, kind, (cmd||''), JSON.stringify(args), JSON.stringify(env), 'running', 0, now(), child ? child.pid : null]);
    } catch (err){
      const proc = PROCS.get(id);
      if (proc && proc.pgid){
        try { process.kill(-proc.pgid, 'SIGTERM'); } catch {}
        PROCS.delete(id);
      }
      throw err;
    }

    await appendEvent(id, 'state', {status:'running', project, kind});
    await led({type:'led.progress', pct:5, ttl_s:180});

    if (kind==='pipeline'){
      runPipeline(id, project, env).catch(async e=>{
        await appendEvent(id, 'log', `\n[error] ${String(e)}\n`);
        await updateJob(id, {status:'error', finished_at: now()});
        await led({type:'led.emotion', emotion:'error', ttl_s:20});
      });
    } else {
      runSingle(id, child); // handles close & LEDs
    }
    return id;
  }

  // --- Routes ---
  app.post('/api/jobs/start', async (req,res)=>{
    let raw=''; req.on('data',d=>raw+=d); await new Promise(r=>req.on('end',r));
    let body={}; try{ body=JSON.parse(raw||'{}'); }catch{ return res.status(400).json({error:'bad json'}) }
    try{ const id = await startJob(body); res.json({ok:true, job_id:id}); }
    catch(e){ res.status(500).json({error:String(e)}) }
  });

  app.get('/api/jobs/:id', async (req,res)=>{
    const id = String(req.params.id);
    const j = await get(d, `SELECT * FROM jobs WHERE job_id=?`, [id]);
    if (!j) return res.status(404).json({error:'not found'});
    res.json(j);
  });

  app.get('/api/jobs', async (req,res)=>{
    const pr = String(req.query.project||'');
    const rows = await all(d, `SELECT job_id,project_id,kind,status,progress,started_at,finished_at FROM jobs
                               ${pr?'WHERE project_id=?':''} ORDER BY started_at DESC LIMIT 50`, pr?[pr]:[]);
    res.json(rows);
  });

  app.post('/api/jobs/:id/cancel', async (req,res)=>{
    const id = String(req.params.id);
    const proc = PROCS.get(id);
    await updateJob(id, {status:'canceled', finished_at: now()});
    await appendEvent(id, 'log', '\n[cancel requested]\n');
    if (proc && proc.pgid){
      try{
        // Register cleanup before sending SIGTERM to avoid race if process exits quickly
        const killTimer = setTimeout(()=>{
          try{
            // Only send SIGKILL if the process is still registered
            if (PROCS.has(id)) process.kill(-proc.pgid, 'SIGKILL');
          }catch{}
        }, 5000);
        proc.child.once('close', ()=>clearTimeout(killTimer));
        process.kill(-proc.pgid, 'SIGTERM');
      }catch{}
    }
    res.json({ok:true});
  });

  // SSE
  app.get('/api/jobs/:id/events', async (req,res)=>{
    const id = String(req.params.id);
    res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','X-Accel-Buffering':'no' });
    const rows = await all(d, `SELECT type,data FROM job_events WHERE job_id=? ORDER BY seq ASC`, [id]);
    for (const r of rows){ res.write(`event: ${r.type}\n`); res.write(`data: ${r.data}\n\n`); }
    if (!clients.has(id)) clients.set(id, new Set());
    clients.get(id).add(res);
    req.on('close', ()=>{ const set=clients.get(id); if(set){ set.delete(res); if(!set.size) clients.delete(id);} });
  });

  app.locals.jobs = { start: startJob };
  console.log('[jobs] v2 online');
};
