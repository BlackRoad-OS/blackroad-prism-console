'use strict';

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const router = express.Router();

const REPO_PATH = process.env.GIT_REPO_PATH || process.cwd();
const REMOTE_NAME = process.env.GIT_REMOTE_NAME || 'origin';
const ALLOW_GIT_ACTIONS =
  String(process.env.ALLOW_GIT_ACTIONS || 'false').toLowerCase() === 'true';

async function runGit(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: REPO_PATH });
  return stdout.trim();
}

router.get('/health', async (_req, res) => {
  try {
    let remoteConfigured = false;
    try {
      await execFileAsync('git', ['remote', 'get-url', REMOTE_NAME], { cwd: REPO_PATH });
      remoteConfigured = true;
    } catch (_) {
      remoteConfigured = false;
    }
    res.json({
      ok: true,
      repoPath: REPO_PATH,
      readOnly: !ALLOW_GIT_ACTIONS,
      remote: { name: REMOTE_NAME, urlPresent: remoteConfigured },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/status', async (_req, res) => {
  try {
    const statusRaw = await runGit(['status', '--porcelain=v2', '--branch']);
    const lines = statusRaw.split('\n').filter(Boolean);
    let branch = '';
    let ahead = 0;
    let behind = 0;
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;

    for (const line of lines) {
      if (line.startsWith('# branch.head')) {
        branch = line.split(' ')[2] || '';
      } else if (line.startsWith('# branch.ab')) {
        const parts = line.split(' ');
        ahead = Number.parseInt(parts[2].replace('+', ''), 10) || 0;
        behind = Number.parseInt(parts[3].replace('-', ''), 10) || 0;
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const code = line.split(' ')[1] || '';
        if (code[0] !== '.') staged += 1;
        if (code[1] !== '.') unstaged += 1;
      } else if (line.startsWith('? ')) {
        untracked += 1;
      }
    }

    const shortHash = await runGit(['rev-parse', '--short', 'HEAD']);
    const isDirty = staged > 0 || unstaged > 0 || untracked > 0;

    res.json({
      ok: true,
      branch,
      ahead,
      behind,
      shortHash,
      isDirty,
      counts: { staged, unstaged, untracked },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
