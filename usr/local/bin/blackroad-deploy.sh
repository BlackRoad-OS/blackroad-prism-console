#!/usr/bin/env bash
# FILE: /usr/local/bin/blackroad-deploy.sh
# Description: Atomic rsync deploy from a working copy (local or over SSH) to a Linux droplet.
# Requires: ssh, rsync, bash, curl on the runner; ssh, bash, curl, node/npm (optional) on the droplet.

set -Eeuo pipefail

### ──────────────────────────────
### Required environment variables
### ──────────────────────────────
: "${DROPLET_SSH:?Set DROPLET_SSH, e.g. user@your-droplet}"
: "${DROPLET_PATH:?Set DROPLET_PATH, e.g. /srv/blackroad-api}"
: "${WORKING_COPY_SSH:?Set WORKING_COPY_SSH, e.g. user@your-ios-device or 'local'}"
# SLACK_WEBHOOK_URL is optional for notifications

### ──────────────────────────────
### Tunables (override via env)
### ──────────────────────────────
# Path to repo on the working-copy host (or local path if WORKING_COPY_SSH=local).
# When running locally, bash does not expand the leading tilde inside the
# parameter expansion above, so we do it explicitly to honor ~/ paths.
WORKING_COPY_PATH="${WORKING_COPY_PATH:-~/blackroad-api}"
if [[ "$WORKING_COPY_SSH" == "local" ]]; then
  WORKING_COPY_PATH="${WORKING_COPY_PATH/#\~/$HOME}"
fi
SERVICE_NAME="${SERVICE_NAME:-blackroad-api}"                 # systemd or PM2 process name on droplet
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/api/health}"  # droplet-local health endpoint
KEEP_RELEASES="${KEEP_RELEASES:-7}"                           # how many releases to keep
RSYNC_EXCLUDES="${RSYNC_EXCLUDES:-.git node_modules .venv venv __pycache__ *.log logs .DS_Store tmp .idea .vscode}"
NPM_CI="${NPM_CI:-true}"                                      # run npm ci if package.json exists
DRY_RUN="${DRY_RUN:-false}"                                    # set true to preview rsync (no remote switch/restart)
SSH_OPTS="${SSH_OPTS:- -o BatchMode=yes -o StrictHostKeyChecking=accept-new }"

### ──────────────────────────────
### Helpers
### ──────────────────────────────
say() { printf "==> %s\n" "$*"; }
err() { printf "!!  %s\n" "$*" >&2; }
timestamp() { date -u +"%Y%m%d-%H%M%S-UTC"; }

notify() {
  # Notify Slack, if webhook is configured
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    local msg="$1"
    curl -fsS -X POST -H 'Content-type: application/json' \
      --data "{\"text\": \"${msg//$'\n'/\\n}\"}" \
      "$SLACK_WEBHOOK_URL" >/dev/null || true
  fi
}

rsh() { ssh $SSH_OPTS "$DROPLET_SSH" "$@"; }

remote_bash() {
  # Run a bash -lc command on droplet (ensures login semantics for PATH)
  local cmd="$1"
  rsh "bash -lc '$cmd'"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 1; }
}

### ──────────────────────────────
### Pre-flight checks
### ──────────────────────────────
require_cmd ssh
require_cmd rsync
require_cmd bash
require_cmd curl

if ! rsh 'echo ok' >/dev/null 2>&1; then
  err "Cannot SSH to $DROPLET_SSH"
  exit 1
fi

### ──────────────────────────────
### Build arguments
### ──────────────────────────────
RELEASE="$(timestamp)"
RELEASES_DIR="$DROPLET_PATH/releases"
NEW_RELEASE_DIR="$RELEASES_DIR/$RELEASE"
CURRENT_LINK="$DROPLET_PATH/current"
SHARED_DIR="$DROPLET_PATH/shared"

# Determine rsync source: local or remote working copy
if [[ "$WORKING_COPY_SSH" == "local" ]]; then
  RSYNC_SRC="$WORKING_COPY_PATH/"
else
  RSYNC_SRC="$WORKING_COPY_SSH:$WORKING_COPY_PATH/"
fi
RSYNC_DEST="$DROPLET_SSH:$NEW_RELEASE_DIR/"

EXCLUDE_ARGS=()
for pat in $RSYNC_EXCLUDES; do EXCLUDE_ARGS+=(--exclude "$pat"); done
if [[ "$DRY_RUN" == "true" ]]; then EXCLUDE_ARGS+=(--dry-run); fi

### ──────────────────────────────
### Commands
### ──────────────────────────────
init_remote_tree() {
  say "Ensuring remote directories exist on $DROPLET_SSH ..."
  remote_bash "mkdir -p '$RELEASES_DIR' '$SHARED_DIR/logs'"
}

sync_release() {
  say "Rsync working copy → droplet: $RSYNC_SRC → $RSYNC_DEST"
  rsync -az --delete "${EXCLUDE_ARGS[@]}" -e "ssh $SSH_OPTS" "$RSYNC_SRC" "$RSYNC_DEST"
}

link_shared_and_env() {
  say "Linking shared files (e.g., .env) into new release ..."
  remote_bash "
    if [[ -f '$SHARED_DIR/.env' ]]; then ln -sfn '$SHARED_DIR/.env' '$NEW_RELEASE_DIR/.env'; fi
    mkdir -p '$NEW_RELEASE_DIR/logs'
    ln -sfn '$SHARED_DIR/logs' '$NEW_RELEASE_DIR/logs/shared'
  "
}

install_deps() {
  if [[ "$NPM_CI" == "true" ]]; then
    say "Install production dependencies if package.json exists ..."
    remote_bash "
      if [[ -f '$NEW_RELEASE_DIR/package.json' ]]; then
        cd '$NEW_RELEASE_DIR'
        if command -v npm >/dev/null 2>&1; then
          npm ci --omit=dev
        fi
      fi
    "
  fi
}

switch_release() {
  say "Atomically switching current → $NEW_RELEASE_DIR"
  remote_bash "ln -sfn '$NEW_RELEASE_DIR' '$CURRENT_LINK.tmp' && mv -Tf '$CURRENT_LINK.tmp' '$CURRENT_LINK'"
}

restart_service() {
  say "Restarting service $SERVICE_NAME ..."
  # Try systemd, then PM2 as a fallback
  remote_bash "
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl restart '$SERVICE_NAME' || systemctl restart '$SERVICE_NAME' || true
      systemctl is-active '$SERVICE_NAME' >/dev/null 2>&1 || true
    fi
    if command -v pm2 >/dev/null 2>&1; then
      pm2 restart '$SERVICE_NAME' >/dev/null 2>&1 || true
      pm2 save >/dev/null 2>&1 || true
    fi
  "
}

health_check() {
  say "Health check: $HEALTH_URL (on droplet) ..."
  # Run health check from inside the droplet to avoid firewall/ingress variance
  local retries=20
  local delay=2
  local ok=1
  for i in $(seq 1 $retries); do
    if rsh "curl -fsS --max-time 2 '$HEALTH_URL' >/dev/null"; then
      ok=0; break
    fi
    sleep "$delay"
    delay=$(( delay < 10 ? delay + 1 : 10 ))
  done
  return $ok
}

cleanup_old() {
  say "Pruning to keep latest $KEEP_RELEASES releases ..."
  remote_bash "
    cd '$RELEASES_DIR' || exit 0
    ls -1dt */ 2>/dev/null | tail -n +$((KEEP_RELEASES+1)) | xargs -r -I{} rm -rf '{}'
  "
}

current_target() {
  rsh "readlink -f '$CURRENT_LINK' 2>/dev/null || echo ''"
}

previous_release_dir() {
  remote_bash "
    cd '$RELEASES_DIR' || exit 0
    ls -1dt */ 2>/dev/null | sed -n '2p' | sed 's#/$##;s#/$##' || true
  "
}

rollback() {
  say "Attempting rollback to previous release ..."
  local prev relpath
  prev="$(previous_release_dir || true)"
  if [[ -z "$prev" ]]; then
    err "No previous release found to rollback."
    return 1
  fi
  relpath="$RELEASES_DIR/$prev"
  say "Switching current → $relpath"
  remote_bash "ln -sfn '$relpath' '$CURRENT_LINK.tmp' && mv -Tf '$CURRENT_LINK.tmp' '$CURRENT_LINK'"
  restart_service
  if health_check; then
    say "Rollback health check: OK"
    notify ":warning: BlackRoad rollback succeeded → \`$prev\` on \`$DROPLET_SSH\`."
  else
    err "Rollback health check failed."
    notify ":x: BlackRoad rollback failed on \`$DROPLET_SSH\`. Manual intervention required."
    return 1
  fi
}

### ──────────────────────────────
### Main entrypoints
### ──────────────────────────────
cmd_deploy() {
  notify ":rocket: Deploy started → \`$DROPLET_SSH\` path \`$DROPLET_PATH\` (release \`$RELEASE\`)."
  init_remote_tree
  sync_release
  link_shared_and_env
  install_deps

  if [[ "$DRY_RUN" == "true" ]]; then
    say "DRY_RUN=true → skipping switch/restart/health."
    notify ":information_source: Dry run complete for release \`$RELEASE\` on \`$DROPLET_SSH\`."
    exit 0
  fi

  # Remember previous current for potential rollback
  PRE_SWITCH_CURRENT="$(current_target || true)"

  switch_release
  restart_service

  if health_check; then
    say "Health check passed. Deploy complete."
    cleanup_old
    notify ":white_check_mark: BlackRoad deploy success → \`$DROPLET_SSH\` release \`$RELEASE\`."
  else
    err "Health check FAILED. Rolling back ..."
    notify ":warning: Health check failed after deploy \`$RELEASE\`. Attempting rollback on \`$DROPLET_SSH\`."
    if rollback; then
      err "Rolled back to previous working release."
    else
      err "Automatic rollback failed; manual fix required."
    fi
    exit 1
  fi
}

cmd_status() {
  say "Status on $DROPLET_SSH:"
  remote_bash "
    echo 'Current → ' \$(readlink -f '$CURRENT_LINK' 2>/dev/null || echo '(none)')
    echo 'Releases:'
    ls -1dt '$RELEASES_DIR'/* 2>/dev/null | head -n 10 || true
    if command -v systemctl >/dev/null 2>&1; then
      echo ''; systemctl status '$SERVICE_NAME' --no-pager || true
    elif command -v pm2 >/dev/null 2>&1; then
      echo ''; pm2 status '$SERVICE_NAME' || true
    fi
  "
}

cmd_releases() {
  remote_bash "ls -1dt '$RELEASES_DIR'/* 2>/dev/null || true"
}

cmd_rollback() {
  rollback
}

usage() {
  cat <<USAGE
Usage: $(basename "$0") <deploy|status|releases|rollback>

Environment:
  DROPLET_SSH           (required) e.g. user@your-droplet
  DROPLET_PATH          (required) e.g. /srv/blackroad-api
  WORKING_COPY_SSH      (required) 'local' or user@your-ios-device
  WORKING_COPY_PATH     (optional) default: ~/blackroad-api (on working-copy host)
  SERVICE_NAME          (optional) default: blackroad-api
  HEALTH_URL            (optional) default: http://127.0.0.1:4000/api/health
  KEEP_RELEASES         (optional) default: 7
  RSYNC_EXCLUDES        (optional) space-separated patterns to exclude
  NPM_CI                (optional) true|false (default true)
  DRY_RUN               (optional) true|false (default false)
  SLACK_WEBHOOK_URL     (optional) Slack incoming webhook for notifications

Examples:
  DRY_RUN=true $(basename "$0") deploy
  $(basename "$0") status
  $(basename "$0") releases
  $(basename "$0") rollback   # reverts to the previous release and health-checks it
USAGE
}

main() {
  local cmd="${1:-deploy}"
  case "$cmd" in
    deploy)    cmd_deploy ;;
    status)    cmd_status ;;
    releases)  cmd_releases ;;
    rollback)  cmd_rollback ;;
    -h|--help|help) usage ;;
    *) err "Unknown command: $cmd"; usage; exit 2 ;;
  esac
}
main "$@"
