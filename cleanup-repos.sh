#!/usr/bin/env bash
# Branch Cleanup Helper Script
# Simplified interface to run branch cleanup across repositories

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
  cat <<EOF
Usage: $0 [COMMAND]

Commands:
  dry-run     Preview what branches would be deleted (safe, recommended first)
  run         Execute live cleanup (DANGER: actually deletes branches!)
  status      Show recent cleanup reports
  help        Show this help message

Environment:
  BRANCH_CLEANUP_TOKEN    Required: GitHub token with appropriate permissions
                         (or set GITHUB_TOKEN as fallback)

Examples:
  # Preview cleanup
  export BRANCH_CLEANUP_TOKEN=ghp_your_token_here
  $0 dry-run

  # Execute cleanup
  $0 run

  # View reports
  $0 status

For detailed documentation, see: CLEANUP_INSTRUCTIONS.md
EOF
}

check_token() {
  if [ -z "${BRANCH_CLEANUP_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    echo -e "${RED}ERROR: No GitHub token found${NC}"
    echo ""
    echo "Please set BRANCH_CLEANUP_TOKEN or GITHUB_TOKEN:"
    echo "  export BRANCH_CLEANUP_TOKEN=ghp_your_token_here"
    echo ""
    echo "For token creation instructions, see: CLEANUP_INSTRUCTIONS.md"
    exit 1
  fi
  echo -e "${GREEN}✓ GitHub token found${NC}"
}

check_dependencies() {
  echo "Checking dependencies..."
  
  if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js not found${NC}"
    echo "Please install Node.js 20 or higher"
    exit 1
  fi
  
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    CYPRESS_INSTALL_BINARY=0 npm install
  fi
  
  echo -e "${GREEN}✓ Dependencies ready${NC}"
}

dry_run() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  DRY RUN MODE (Preview Only)${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo "This will show what branches would be deleted WITHOUT actually deleting them."
  echo ""
  
  check_token
  check_dependencies
  
  echo ""
  echo "Running cleanup in dry-run mode..."
  echo ""
  
  npm run branch-cleanup:dry
  
  echo ""
  echo -e "${GREEN}✓ Dry run completed${NC}"
  echo ""
  echo "Review the reports in: ops/reports/branch-cleanup/"
  echo "If satisfied, run: $0 run"
}

live_run() {
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  ⚠️  LIVE EXECUTION MODE  ⚠️${NC}"
  echo -e "${RED}========================================${NC}"
  echo ""
  echo -e "${RED}This will ACTUALLY DELETE merged branches!${NC}"
  echo ""
  
  read -p "Are you sure you want to proceed? (type 'yes' to confirm): " confirm
  
  if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
  
  check_token
  check_dependencies
  
  echo ""
  echo "Running live cleanup..."
  echo ""
  
  npm run branch-cleanup:run
  
  echo ""
  echo -e "${GREEN}✓ Cleanup completed${NC}"
  echo ""
  echo "Review the reports in: ops/reports/branch-cleanup/"
}

show_status() {
  echo ""
  echo "Recent Cleanup Reports:"
  echo ""
  
  if [ -d "ops/reports/branch-cleanup" ]; then
    ls -lAht ops/reports/branch-cleanup/ | head -10
    
    echo ""
    echo "Latest report summary:"
    echo ""
    
    # Find the most recent directory
    latest=$(ls -t ops/reports/branch-cleanup/ 2>/dev/null | head -1)
    
    if [ -n "$latest" ] && [ -f "ops/reports/branch-cleanup/$latest/summary.txt" ]; then
      cat "ops/reports/branch-cleanup/$latest/summary.txt"
    else
      echo "No summary found"
    fi
  else
    echo "No reports found. Run a cleanup first:"
    echo "  $0 dry-run"
  fi
  
  echo ""
}

main() {
  case "${1:-help}" in
    dry-run)
      dry_run
      ;;
    run)
      live_run
      ;;
    status)
      show_status
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      echo -e "${RED}Unknown command: $1${NC}"
      echo ""
      usage
      exit 1
      ;;
  esac
}

main "$@"
