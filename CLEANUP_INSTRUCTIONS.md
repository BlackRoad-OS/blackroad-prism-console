# Repository Cleanup Instructions

## Overview

This repository includes an automated branch cleanup system to remove merged bot branches across multiple repositories. This addresses the accumulated bot branches (copilot/_, agent/_, bot/\*, etc.) that remain after PRs are merged.

## What Gets Cleaned Up

The cleanup system targets merged branches matching these patterns:

- `bot/*`
- `bots/*`
- `agent/*`
- `agents/*`
- `autogen/*`
- `automation/*`
- `claude/*`
- `codex/*`
- `copilot/*`
- `dependabot/*`

## Repositories Covered

The cleanup runs across these repositories:

- **BlackRoad-OS/blackroad-prism-console** (primary)
- BlackRoad-AI/BlackRoad.io
- blackboxprogramming/blackroad-api
- blackboxprogramming/blackroad-prism-console

## Safety Features

1. **Backup Tags**: Before deletion, an annotated tag is created for each branch (retained for 30 days)
2. **Age Check**: Only branches merged ≥7 days ago are deleted
3. **Reachability Check**: Branches are only deleted if their commits are reachable from the default branch
4. **Protected Branches**: Protected branches are never deleted
5. **Dry-Run Mode**: Always available to preview changes before execution

## Quick Start

### Prerequisites

1. **Node.js 20+** installed
2. **GitHub Token** with these permissions:
   - Contents: Read & write
   - Pull Requests: Read
   - Issues: Write
   - Administration: Read & write (optional, for auto-delete feature)

### Creating a GitHub Token

1. Go to: https://github.com/settings/tokens?type=beta
2. Click "Generate new token" (fine-grained)
3. Set the permissions listed above
4. Select the repositories to grant access
5. Generate and copy the token

### Running the Cleanup

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Dry Run (Preview Only)

```bash
export BRANCH_CLEANUP_TOKEN=ghp_your_token_here
npm run branch-cleanup:dry
```

Or using make:

```bash
BR_TOKEN=ghp_your_token_here make branch-cleanup-dry
```

#### 3. Live Execution

**⚠️ Warning**: This will actually delete branches!

```bash
export BRANCH_CLEANUP_TOKEN=ghp_your_token_here
npm run branch-cleanup:run
```

Or using make:

```bash
BR_TOKEN=ghp_your_token_here make branch-cleanup-run
```

#### 4. View Reports

```bash
make branch-cleanup-report
# or
ls -la ops/reports/branch-cleanup/
```

## Automated Execution

### GitHub Actions

The cleanup is configured to run automatically via GitHub Actions:

1. **Nightly Schedule**: Runs daily at 03:17 UTC in dry-run mode
2. **Manual Trigger**: Can be manually triggered via Actions tab

To run manually:

1. Go to Actions → "Branch Cleanup"
2. Click "Run workflow"
3. Set `dry_run: false` for live execution (or `true` to preview)
4. Click "Run workflow"

### Setting Up Automation

1. Go to repository Settings → Secrets and variables → Actions
2. Create a new secret: `BRANCH_CLEANUP_TOKEN`
3. Paste your GitHub token
4. Save

The workflow will now run automatically on schedule.

## Configuration

Edit `tools/branch-cleanup/config.yaml` to customize:

```yaml
# Add/remove repositories
orgs:
  - name: BlackRoad-OS
    repos: ['blackroad-prism-console']

# Adjust branch patterns
branch_patterns:
  - 'copilot/*'
  - 'bot/*'

# Modify safety settings
safety:
  minimum_age_days: 7 # Days after merge before deletion
  create_backup_tag: true
  backup_ttl_days: 30
```

## Reports

Reports are generated in `ops/reports/branch-cleanup/<timestamp>/`:

- **report.json**: Complete data with metadata
- **report.csv**: Spreadsheet-friendly format
- **summary.txt**: Human-readable summary

Example summary output:

```
================================================================================
BRANCH CLEANUP REPORT
================================================================================

Timestamp: 2026-02-03 18:00:00
Duration: 45.23s

Overall Summary:
  Total branches processed: 124
  Deleted: 118
  Skipped: 6
  Errors: 0

By Status:
  Deleted: 118
  SkippedProtected: 2
  SkippedTooRecent: 4

By Repository:
  BlackRoad-OS/blackroad-prism-console: 124
```

## Recovering Deleted Branches

If you need to recover a deleted branch:

```bash
# Find the backup tag
git tag -l "cleanup-backup/*"

# Checkout the tag to a new branch
git checkout -b recovered-branch cleanup-backup/copilot-feature-xyz/20260203
git push origin recovered-branch
```

## Troubleshooting

### "BRANCH_CLEANUP_TOKEN not found"

**Solution**: Export the token:

```bash
export BRANCH_CLEANUP_TOKEN=ghp_your_token_here
```

### "Permission denied" (403 errors)

**Solution**: Check that your token has the required permissions:

- Contents: Read & write
- Pull Requests: Read
- Issues: Write

### "No branches found"

**Solution**: Either:

- No merged branches match the configured patterns
- All matching branches are too recent (< 7 days old)
- All matching branches have already been deleted

### Cleanup takes too long

**Solution**: Reduce `max_concurrency` in `tools/branch-cleanup/config.yaml`

## Best Practices

1. **Always run dry-run first** to preview changes
2. **Review reports** before running live cleanup
3. **Enable auto-delete** on repositories to prevent buildup:
   ```bash
   gh api -X PATCH repos/OWNER/REPO -f delete_branch_on_merge=true
   ```
4. **Run cleanup monthly** rather than accumulating thousands of branches

## Support

For issues or questions:

1. Check this documentation
2. Review the tool's README: `tools/branch-cleanup/README.md`
3. Create a GitHub issue with:
   - Report files (JSON + CSV)
   - Command output
   - Token permissions screenshot

## Additional Resources

- Branch Cleanup Tool README: `tools/branch-cleanup/README.md`
- GitHub Actions Workflow: `.github/workflows/branch-cleanup.yml`
- Configuration File: `tools/branch-cleanup/config.yaml`

---

**Last Updated**: 2026-02-03
**Tool Version**: 1.0.0
