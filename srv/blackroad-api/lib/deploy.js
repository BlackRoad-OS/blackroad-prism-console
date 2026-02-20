const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./log');
const { REPO_DIR } = require('./git');

const releasesDir = '/srv/releases';
const archiveDir = path.join(releasesDir, 'archive');
const lockFile = '/var/lock/blackroad.deploy.lock';
const spaSymlink = '/var/www/blackroad';

try {
  fs.mkdirSync(archiveDir, { recursive: true });
} catch (_) {
  // ignore permission errors in non-production environments
}

function sh(cmd, input) {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
    if (input) child.stdin.end(input);
  });
}

async function stageAndSwitch({ branch, sha }) {
  const ts = Date.now();
  const short = (sha || '').slice(0, 7);
  const releaseId = `${ts}-${short}`;
  const releasePath = path.join(releasesDir, releaseId);
  const script = `
set -e
mkdir -p ${releasePath} ${archiveDir}
cp -r ${REPO_DIR}/frontend ${releasePath}/spa || true
cp -r ${REPO_DIR}/api ${releasePath}/api || true
ln -sfn ${releasePath}/spa ${spaSymlink}
tar -czf ${archiveDir}/${releaseId}.tar.gz -C ${releasesDir} ${releaseId}
systemctl restart blackroad-api
curl -fsS http://127.0.0.1:4000/api/health > /dev/null
echo ${releaseId}
`;
  const out = await sh(`flock ${lockFile} bash`, script);
  logger.info({ event: 'deploy', releaseId, branch, sha });
  return { releaseId, releasePath, output: out };
}

module.exports = { stageAndSwitch };
