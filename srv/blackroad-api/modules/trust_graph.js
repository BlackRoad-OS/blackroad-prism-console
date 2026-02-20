// Trust graph utilities and routes
// Provides /api/trust/graph snapshot of identities, edges, and TrustRank scores

const Database = require('better-sqlite3');

module.exports = function attachTrustGraph({ app }) {
  if (!app) throw new Error('trust_graph: need app');

  const DB_PATH = process.env.DB_PATH || '/srv/blackroad-api/blackroad.db';
  const db = () => new Database(DB_PATH);
  const all = (d, sql, params = []) => Promise.resolve(d.prepare(sql).all(params));

  async function getEdges(d) {
    const rows = await all(d, `SELECT src,dst,weight FROM trust_edges`, []);
    const ids = new Set();
    const outPlus = {}; const outMinus = {};
    for (const r of rows) {
      ids.add(r.src); ids.add(r.dst);
      const dst = r.dst; const w = Number(r.weight);
      const target = w >= 0 ? outPlus : outMinus;
      if (!target[r.src]) target[r.src] = [];
      target[r.src].push({ dst, weight: w });
    }
    return { idArr: Array.from(ids), outPlus, outMinus };
  }

  function trustRank({ idArr, seeds = {} }) {
    const vec = {};
    for (const id of idArr) vec[id] = seeds[id] ?? 0.5;
    return vec;
  }

  // --- Graph snapshot (optionally with ?lid=<lens_id>) ---
  app.get('/api/trust/graph', async (req, res) => {
    const d = db();
    try {
      const lid = req.query.lid || null;
      const lens = lid ? (await all(d, `SELECT * FROM trust_lenses WHERE lens_id=?`, [lid]))[0] : null;
      const seeds = lens ? JSON.parse(lens.seeds_json || '{}') : {};
      const { idArr, outPlus, outMinus } = await getEdges(d);
      const trustVec = trustRank({ idArr, outPlus, outMinus, seeds, alpha: 0.85, beta: 0.5, iters: 50 });

      const labelsRows = await all(d, `SELECT did,label FROM trust_identities`, []);
      const labels = Object.fromEntries(labelsRows.map(r => [r.did, r.label || r.did]));
      const nodes = idArr.map(did => ({ id: did, label: labels[did] || did, trust: +(trustVec[did] ?? 0.5) }));
      const edgesRows = await all(d, `SELECT src,dst,weight FROM trust_edges`, []);
      const edges = edgesRows.map(r => ({ source: r.src, target: r.dst, weight: +r.weight }));
      res.json({ nodes, edges, lens: lens ? { id: lens.lens_id, lambda: +lens.lambda } : null });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    } finally {
      d.close();
    }
  });

  console.log('[trust_graph] mounted');
};
// Trust graph + lenses + ranked feed (Love ⨂ Trust).
// Uses signed TrustRank: t = (1-α)·s + α·(P+^T t - β P-^T t), clip to [0,1].
// Caches Truth objects from IPFS locally for fast ranking.

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const IPFS_GATE = process.env.IPFS_GATE || 'http://127.0.0.1:8080'; // for GET /ipfs/:cid
const DB_PATH = process.env.DB_PATH || '/srv/blackroad-api/blackroad.db';
const TRUTH_DIR = process.env.TRUTH_DIR || '/srv/truth';
const CACHE_DIR = path.join(TRUTH_DIR, 'cache');
const ORIGIN_KEY_PATH = process.env.ORIGIN_KEY_PATH || '/srv/secrets/origin.key';
const MAX_BODY_BYTES = Number(process.env.TRUST_GRAPH_MAX_BODY || 256 * 1024);
const CID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

let ORIGIN_KEY = '';
try {
  ORIGIN_KEY = fs.readFileSync(ORIGIN_KEY_PATH, 'utf8').trim();
} catch {}

function payloadError(code, message) {
  const err = new Error(message);
  err.statusCode = code;
  return err;
}

async function readJsonBody(req, limitBytes = MAX_BODY_BYTES) {
  const lenHeader = Number(req.headers['content-length'] || '0');
  if (lenHeader && lenHeader > limitBytes) {
    throw payloadError(413, 'payload_too_large');
  }
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, 'utf8') > limitBytes) {
      throw payloadError(413, 'payload_too_large');
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw payloadError(400, 'bad_json');
  }
}

function requireAuth(req, res, next) {
  const ip = req.socket?.remoteAddress || '';
  if (ip.startsWith('127.') || ip === '::1') return next();
  const key = req.get ? req.get('X-BlackRoad-Key') : req.headers['x-blackroad-key'];
  if (ORIGIN_KEY && key === ORIGIN_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function ensureCidFormat(cid) {
  if (typeof cid !== 'string' || !CID_RE.test(cid)) {
    throw new Error('invalid_cid');
  }
  return cid;
}

function safeCachePath(cid) {
  const safeCid = ensureCidFormat(cid);
  const fp = path.join(CACHE_DIR, `${safeCid}.json`);
  const resolved = path.resolve(fp);
  if (!resolved.startsWith(path.resolve(CACHE_DIR))) throw new Error('invalid_cid');
  return { safeCid, fp };
}

function tailFileLines(filePath, maxLines = 500) {
  if (!fs.existsSync(filePath)) return [];
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const chunkSize = 64 * 1024;
    let position = stat.size;
    let buffer = '';
    const lines = [];
    while (position > 0 && lines.length < maxLines) {
      const toRead = Math.min(chunkSize, position);
      position -= toRead;
      const chunk = Buffer.alloc(toRead);
      fs.readSync(fd, chunk, 0, toRead, position);
      buffer = chunk.toString('utf8') + buffer;
      let idx;
      while ((idx = buffer.lastIndexOf('\n')) !== -1) {
        const line = buffer.slice(idx + 1);
        buffer = buffer.slice(0, idx);
        if (line) {
          lines.push(line);
          if (lines.length === maxLines) break;
        }
      }
    }
    if (buffer && lines.length < maxLines) lines.push(buffer);
    return lines.reverse();
  } finally {
    fs.closeSync(fd);
  }
}

function dbOpen() { return new sqlite3.Database(DB_PATH); }
function all(db, sql, p=[]) { return new Promise((r,j)=>db.all(sql,p,(e,x)=>e?j(e):r(x))); }
function run(db, sql, p=[]) { return new Promise((r,j)=>db.run(sql,p,function(e){e?j(e):r(this)})); }

async function getEdges(db){
  const rows = await all(db, `SELECT src,dst,weight FROM trust_edges`);
  const ids = new Set();
  rows.forEach(r=>{ids.add(r.src); ids.add(r.dst);});
  const idArr = Array.from(ids);
  const index = Object.fromEntries(idArr.map((d,i)=>[d,i]));
  // build outgoing lists for + and -
  const outPlus = Array(idArr.length).fill(0).map(()=>[]);
  const outMinus= Array(idArr.length).fill(0).map(()=>[]);
  for (const {src,dst,weight} of rows){
    const i = index[src], j = index[dst];
    if (weight > 0) outPlus[i].push({j,w:weight});
    else if (weight < 0) outMinus[i].push({j,w:Math.abs(weight)});
  }
  return { idArr, index, outPlus, outMinus };
}

function normalizeOut(lists){
  // convert outgoing weighted edges to row-stochastic probs
  return lists.map(arr=>{
    const sum = arr.reduce((s,e)=>s+e.w,0);
    if (sum <= 0) return [];
    return arr.map(e=>({j:e.j, p:e.w/sum}));
  });
}

function trustRank({ idArr, outPlus, outMinus, seeds={}, alpha=0.85, beta=0.5, iters=50 }){
  const n = idArr.length;
  if (n===0) return {};
  const Pp = normalizeOut(outPlus);
  const Pm = normalizeOut(outMinus);
  const s = new Float64Array(n).fill(0);
  let ssum = 0;
  for (const [did, val] of Object.entries(seeds)){
    const k = idArr.indexOf(did); if (k>=0){ s[k] = Math.max(0, Math.min(1, +val||0)); ssum += s[k]; }
  }
  if (ssum===0){ s[0]=1; ssum=1; } // fallback seed
  for (let i=0;i<n;i++) s[i]/=ssum;

  let t = new Float64Array(n).fill(1/n);
  let nxt = new Float64Array(n);
  for (let k=0;k<iters;k++){
    nxt.fill(0);
    // add positive walk
    for (let i=0;i<n;i++){
      const ti = t[i];
      const row = Pp[i];
      for (let e=0;e<row.length;e++){
        const {j,p} = row[e];
        nxt[j] += alpha * ti * p;
      }
    }
    // subtract negative influence
    for (let i=0;i<n;i++){
      const ti = t[i];
      const row = Pm[i];
      for (let e=0;e<row.length;e++){
        const {j,p} = row[e];
        nxt[j] -= alpha*beta * ti * p;
      }
    }
    // restart + clip
    for (let i=0;i<n;i++){
      nxt[i] += (1-alpha) * s[i];
      if (nxt[i] < 0) nxt[i]=0;
    }
    // normalize to [0,1] by max
    let mx=0; for (let i=0;i<n;i++) if (nxt[i]>mx) mx=nxt[i];
    if (mx>0){ for (let i=0;i<n;i++) nxt[i]/=mx; }
    // swap
    t.set(nxt);
  }
  const out = {};
  for (let i=0;i<n;i++) out[idArr[i]] = Math.max(0, Math.min(1, t[i]));
  return out;
}

async function fetchTruth(cid){
  fs.mkdirSync(CACHE_DIR, {recursive:true});
  const { safeCid, fp } = safeCachePath(cid);
  if (fs.existsSync(fp)){
    try { return JSON.parse(fs.readFileSync(fp,'utf8')); } catch {}
  }
  const r = await fetch(`${IPFS_GATE}/ipfs/${safeCid}`, { method:'GET' });
  if (!r.ok) throw new Error('ipfs fetch '+r.status);
  const txt = await r.text();
  fs.writeFileSync(fp, txt);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error('invalid_truth_json');
  }
}

function ageSeconds(tsIso){
  const t = +new Date(tsIso || Date.now());
  return Math.max(0, (Date.now()-t)/1000);
}

module.exports = function attachTrustGraph({ app }){
  const db = dbOpen();
  const sendError = (res, err) => {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: String(err) });
  };

  // identities
  app.post('/api/trust/identities', requireAuth, async (req,res)=>{
    try {
      const o = await readJsonBody(req);
      if (!o.did) return res.status(400).json({error:'did required'});
      await run(db, `INSERT OR IGNORE INTO trust_identities (did,label,created_at) VALUES (?,?,?)`, [o.did, o.label||null, Math.floor(Date.now()/1000)]);
      res.json({ok:true});
    } catch (err) {
      sendError(res, err);
    }
  });

  // add/replace edge
  app.post('/api/trust/edge', requireAuth, async (req,res)=>{
    try {
      const o = await readJsonBody(req);
      const {src,dst,weight,evidence} = o;
      if (!(src&&dst) || typeof weight!=='number') return res.status(400).json({error:'src,dst,weight required'});
      if (weight<-1 || weight>1) return res.status(400).json({error:'weight in [-1,1]'});
      await run(db, `INSERT INTO trust_edges (src,dst,weight,evidence_cid,created_at) VALUES (?,?,?,?,?)
                     ON CONFLICT(src,dst) DO UPDATE SET weight=excluded.weight, evidence_cid=excluded.evidence_cid, created_at=excluded.created_at`,
                [src,dst,weight,evidence||null, Math.floor(Date.now()/1000)]);
      res.json({ok:true});
    } catch (err) {
      sendError(res, err);
    }
  });

  // lenses
  app.post('/api/lenses', requireAuth, async (req,res)=>{
    try {
      const o = await readJsonBody(req);
      const id = o.lens_id || o.id || `lens-${randomUUID()}`;
      const seeds = JSON.stringify(o.seeds||{});
      const loveOver = JSON.stringify(o.love_override||null);
      const rawLambda = Number.isFinite(+o.lambda) ? +o.lambda : 0.6;
      const lambda = Math.max(0, Math.min(1, rawLambda));
      await run(db, `INSERT OR REPLACE INTO trust_lenses (lens_id,label,lambda,seeds_json,love_override_json,created_at)
                     VALUES (?,?,?,?,?,?)`,
                [id, o.label||id, lambda, seeds, loveOver, Math.floor(Date.now()/1000)]);
      res.json({ok:true, lens_id:id});
    } catch (err) {
      sendError(res, err);
    }
  });
  app.get('/api/lenses', async (_req,res)=>{
    const rows = await all(db, `SELECT lens_id,label,lambda,seeds_json,love_override_json FROM trust_lenses ORDER BY created_at DESC`);
    res.json(rows.map(r=>({ lens_id:r.lens_id, label:r.label, lambda:r.lambda,
      seeds: (()=>{
        try{return JSON.parse(r.seeds_json||'{}');}catch{return {};}
      })(),
      love_override:(()=>{ try{return JSON.parse(r.love_override_json||'null');}catch{return null;}})()
    })));
  });

  // compute trust scores
  app.post('/api/trust/compute', requireAuth, async (req,res)=>{
    try {
      const o = await readJsonBody(req);
      const { idArr,outPlus,outMinus } = await getEdges(db);
      const seeds = o.seeds || {};
      const t = trustRank({ idArr, outPlus, outMinus, seeds, alpha:o.alpha??0.85, beta:o.beta??0.5, iters:o.iters??50 });
      res.json(t);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ranked feed with lens
  app.get('/api/truth/feed:lens', async (req,res)=>{
    try{
      const lid = req.query.lid || null;
      const lens = lid ? (await all(db, `SELECT * FROM trust_lenses WHERE lens_id=?`, [lid]))[0] : null;
      let seeds = {};
      let lambda = 0.6;
      if (lens){
        try { seeds = JSON.parse(lens.seeds_json||'{}'); } catch { seeds = {}; }
        lambda = Number.isFinite(+lens.lambda) ? +lens.lambda : 0.6;
      }

      const { idArr,outPlus,outMinus } = await getEdges(db);
      const trustVec = trustRank({ idArr, outPlus, outMinus, seeds, alpha:0.85, beta:0.5, iters:50 });

      const feedPath = path.join(TRUTH_DIR, 'feed.ndjson');
      const lines = tailFileLines(feedPath, 500);
      const rows = lines.map(line=>{ try { return JSON.parse(line); } catch { return null; } }).filter(r=>r && typeof r.cid==='string');

      const fetchTasks = rows.map(r=>{
        try {
          const safeCid = ensureCidFormat(r.cid);
          return fetchTruth(safeCid).then(obj=>({ cid:safeCid, obj }));
        } catch {
          return null;
        }
      }).filter(Boolean);

      const results = await Promise.allSettled(fetchTasks);
      const out = [];
      for (const result of results){
        if (result.status !== 'fulfilled') continue;
        const { cid, obj } = result.value;
        const pub = obj?.meta?.publisher || obj?.meta?.did || 'unknown';
        const love = Math.max(0, Math.min(1, Number.isFinite(+obj?.love) ? +obj.love : 0.5));
        const attestCids = Array.isArray(obj?.evidence) ? obj.evidence : [];
        const T = Math.max(0, Math.min(1, trustVec[pub] ?? 0.5));
        const age = ageSeconds(obj?.meta?.created);
        const rec = Math.exp(-age/172800);
        const attestBoost = 1 + 0.3*Math.log(1 + attestCids.length);
        const score = (lambda*love + (1-lambda)*T) * rec * attestBoost;

        out.push({ cid, title:obj?.title||obj?.type||'(untitled)', publisher: pub, love, trust:T, score, created: obj?.meta?.created });
      }
      out.sort((a,b)=>b.score-a.score);
      res.json(out.slice(0,200));
    }catch(e){ res.status(500).json({error:String(e)}) }
  });

  console.log('[trust] graph + lenses online');
};
