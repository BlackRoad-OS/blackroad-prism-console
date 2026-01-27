<!-- BlackRoad Prism Console - Pull Request Template -->

# Pull Request

## Summary
<!-- Provide a clear 1-2 line summary of the changes -->



## Type of Change
<!-- Check all that apply -->
- [ ] feat - New feature
- [ ] fix - Bug fix
- [ ] chore - Maintenance/refactoring
- [ ] docs - Documentation only
- [ ] refactor - Code restructuring
- [ ] security - Security fix
- [ ] perf - Performance improvement

## Area
<!-- Check the primary area affected -->
- [ ] API (srv/blackroad-api)
- [ ] UI (sites/*)
- [ ] Ingest/Data (br-ingest-*)
- [ ] Infrastructure/Ops
- [ ] Agents/Bots
- [ ] Documentation

## Changes Made
<!-- List the main files changed and why -->
**Files changed:**
- 
- 

**Why these changes were made:**
- 
- 

## Testing & Validation

### Commands Run Locally
```bash
# Bootstrap/Install (if needed)
bash ops/install.sh

# Run tests (example)
cd srv/blackroad-api && npm test && npm run lint

# Start API (dev)
cd srv/blackroad-api && npm run dev

# Start frontend (dev from repo root)
npm run dev:site

# Health check (optional)
npm run health && bash tools/verify-runtime.sh
```

### Test Results
- [ ] All tests pass
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Manual testing completed
- [ ] API `/api/health` returns 200 (if relevant)

## Configuration Changes

### Environment Variables
- [ ] No new environment variables
- [ ] New environment variables added and documented in `srv/blackroad-api/.env.example`

**New variables (if any):**
- 

### Docker/Compose Changes
- [ ] No docker-compose or port changes
- [ ] Docker/compose changes documented below

**Changes (if any):**
- 

### Dependency Changes
- [ ] No new dependencies
- [ ] New dependencies added and scanned with `node tools/dep-scan.js --dir <package> --save`

**New dependencies (if any):**
- 

## Security & Safety

- [ ] No secrets/keys/tokens in the diff
- [ ] Credentials only set via environment variables
- [ ] Security considerations addressed
- [ ] Gitleaks will scan automatically

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated (if needed)
- [ ] Tests added/updated (if applicable)
- [ ] No breaking changes (or clearly documented)
- [ ] Linked related issues/PRs

## User Impact
<!-- 1-2 sentences on how this affects end users -->


## Notes for Reviewers
<!-- Any context, trade-offs, or special instructions -->


## Release Note
<!-- Short, public-facing description for release notes (if applicable) -->
- 

---

**For Automated PRs:**
- Agent/bot that created this: 
- Validation: CI must pass before merge
- Rollback plan: 

**Next Steps:**
- [ ] Review and approve
- [ ] Merge to main
- [ ] Monitor first deploy
- [ ] Update documentation (if needed)

