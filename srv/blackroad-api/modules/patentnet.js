// PatentNet API: hash, archive, mint, verify, daily merkle anchor
// Requires: ethers@6, crypto, fs. ENV: ETH_RPC_URL, MINT_PK, CLAIMREG_ADDR
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let ethers;
try {
  ({ ethers } = require('ethers'));
} catch (err) {
  console.warn(`[patentnet] WARNING: ethers not installed (${err.message})`);
}

module.exports = function attachPatentNet({ app }) {
  const ARCH = '/srv/patent-archive';
  try { fs.mkdirSync(ARCH, { recursive: true }); } catch (_) {}
  const STATUS_FILE = path.join(ARCH, '.anchor-status.json');

  let provider = null;
  if (ethers && process.env.ETH_RPC_URL) {
    try {
      provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    } catch (err) {
      console.warn(`[patentnet] WARNING: invalid ETH_RPC_URL (${err.message})`);
    }
  }

  let wallet = null;
  if (ethers && process.env.MINT_PK) {
    try {
      wallet = new ethers.Wallet(process.env.MINT_PK, provider || undefined);
    } catch (err) {
      console.warn(`[patentnet] WARNING: invalid MINT_PK (${err.message})`);
    }
  }
  const claimAddr =
    process.env.CLAIMREG_ADDR ||
    (fs.existsSync('/srv/blackroad-api/.claimregistry.addr')
      ? fs.readFileSync('/srv/blackroad-api/.claimregistry.addr', 'utf8').trim()
      : '');
  if (!claimAddr) console.warn('[patentnet] WARNING: no CLAIMREG_ADDR set');
  const abi = [
    'function registerClaim(address to, bytes32 contentHash, string uri, string claimType) external returns (uint256)',
    'function commitDailyRoot(uint256 yyyymmdd, bytes32 root) external',
    'event ClaimRegistered(uint256 indexed tokenId, address indexed owner, bytes32 contentHash, string uri, string claimType, uint64 timestamp)',
  ];
  const contract =
    claimAddr && wallet ? new ethers.Contract(claimAddr, abi, wallet) : null;

  const OK = (res, x) =>
    res
      .type('application/json')
      .send(JSON.stringify({ ok: true, data: x, error: null }));
  const FAIL = (res, msg, code = 400) =>
    res
      .status(code)
      .type('application/json')
      .send(JSON.stringify({ ok: false, data: null, error: String(msg) }));

  function sha256(b) {
    return '0x' + crypto.createHash('sha256').update(b).digest('hex');
  }
  function todayInt() {
    const d = new Date();
    return (
      d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
    );
  }

  function recordAnchorStatus(day, status, count, root, txHash, error = null) {
    try {
      const record = {
        day, status, count, root, txHash, error,
        timestamp: new Date().toISOString(),
        timestampUnix: Date.now(),
      };
      let history = [];
      if (fs.existsSync(STATUS_FILE)) {
        try { history = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch (e) { history = []; }
      }
      if (!Array.isArray(history)) history = [];
      history.push(record);
      const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
      history = history.filter((r) => r.timestampUnix > cutoff);
      fs.writeFileSync(STATUS_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
      console.error('[patentnet] Failed to record anchor status:', e);
    }
  }

  app.post('/api/patent/claim', async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.title || !b.claimsText)
        return FAIL(res, 'title and claimsText required', 422);
      const env = {
        title: b.title,
        abstract: b.abstract || '',
        claimsText: b.claimsText,
        tags: b.tags || [],
        ts: new Date().toISOString(),
        author: b.author || 'blackroad',
        attachments: Array.isArray(b.attachments)
          ? b.attachments.map((a) => ({ name: a.name, size: (a.b64 || '').length }))
          : [],
      };
      const norm = Buffer.from(JSON.stringify(env, Object.keys(env).sort()), 'utf8');
      const hash = sha256(norm);
      const day = todayInt();
      const base = `${day}-${hash.slice(2, 10)}-${env.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
      const dir = path.join(ARCH, String(day));
      fs.mkdirSync(dir, { recursive: true });
      const jsonPath = path.join(dir, `${base}.json`);
      fs.writeFileSync(jsonPath, norm);
      if (Array.isArray(b.attachments)) {
        for (const a of b.attachments) {
          if (!a?.name || !a?.b64) continue;
          const p = path.join(dir, `${base}-${a.name.replace(/[^a-zA-Z0-9_.-]+/g, '_')}`);
          fs.writeFileSync(p, Buffer.from(a.b64, 'base64'));
        }
      }
      const uri = `https://blackroad.io/patent-archive/${day}/${path.basename(jsonPath)}`;
      let txHash = null, tokenId = null;
      if (contract) {
        const tx = await contract.registerClaim(wallet.address, hash, uri, String(b.claimType || 'defensive-publication'));
        const rc = await tx.wait();
        txHash = tx.hash;
        const ev = rc.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
          .filter(Boolean).find((e) => e.name === 'ClaimRegistered');
        tokenId = ev?.args?.tokenId?.toString?.() || null;
      }
      OK(res, { hash, archive: jsonPath, uri, chain: claimAddr || null, txHash, tokenId, day });
    } catch (e) {
      FAIL(res, e.message || e, 500);
    }
  });

  app.get('/api/patent/list', (req, res) => {
    const day = req.query.day || '';
    const root = day ? path.join(ARCH, String(day)) : ARCH;
    function scan(d) {
      return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => path.join(d, f)) : [];
    }
    const files = fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()
      ? scan(root)
      : fs.readdirSync(ARCH).flatMap((dd) => scan(path.join(ARCH, dd)));
    OK(res, files.map((p) => ({ path: p, mtime: fs.statSync(p).mtimeMs })));
  });

  app.post('/api/patent/anchor/daily', async (req, res) => {
    try {
      if (!contract) return FAIL(res, 'no contract configured', 500);
      const day = todayInt();
      const dir = path.join(ARCH, String(day));
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
      if (!files.length) {
        recordAnchorStatus(day, 'success', 0, null, null);
        return OK(res, { day, root: null, count: 0 });
      }
      const leaves = files.map((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest());
      function merkle(arr) {
        if (arr.length === 1) return arr[0];
        const next = [];
        for (let i = 0; i < arr.length; i += 2) {
          const a = arr[i], b = arr[i + 1] || arr[i];
          next.push(crypto.createHash('sha256').update(Buffer.concat([a, b])).digest());
        }
        return merkle(next);
      }
      const root = '0x' + merkle(leaves).toString('hex');
      const tx = await contract.commitDailyRoot(day, root);
      await tx.wait();
      recordAnchorStatus(day, 'success', leaves.length, root, tx.hash);
      OK(res, { day, root, count: leaves.length, txHash: tx.hash });
    } catch (e) {
      recordAnchorStatus(todayInt(), 'error', 0, null, null, e.message);
      FAIL(res, e.message || e, 500);
    }
  });

  app.get('/api/patent/compare', async (req, res) => {
    OK(res, { query: req.query.query || '', results: [] });
  });

  app.get('/api/patent/status', (req, res) => {
    try {
      let history = [];
      if (fs.existsSync(STATUS_FILE)) {
        try { history = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch (e) { history = []; }
      }
      if (!Array.isArray(history)) history = [];
      const lastAnchor = history.length > 0 ? history[history.length - 1] : null;
      const today = todayInt();
      const isHealthy = lastAnchor && (lastAnchor.day === today || lastAnchor.day === today - 1) && lastAnchor.status === 'success';
      const last7Days = history.filter((r) => r.day > today - 10);
      OK(res, {
        healthy: isHealthy,
        lastAnchor,
        todayInt: today,
        recent: { successCount: last7Days.filter((r) => r.status === 'success').length, errorCount: last7Days.filter((r) => r.status === 'error').length, total: last7Days.length },
        history: history.slice(-30),
        config: { contractAddress: claimAddr, hasWallet: !!wallet, hasProvider: !!provider, archivePath: ARCH },
      });
    } catch (e) {
      FAIL(res, e.message || e, 500);
    }
  });

  console.log('[patentnet] endpoints ready: /api/patent/*  archive:', ARCH);
};
