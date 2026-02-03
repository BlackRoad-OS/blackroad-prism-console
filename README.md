# BlackRoad Prism Console

> **Part of the BlackRoad-OS organization**

## Repository Maintenance

### Branch Cleanup System

This repository includes an automated branch cleanup system to manage merged bot branches.

📖 **[See CLEANUP_INSTRUCTIONS.md](./CLEANUP_INSTRUCTIONS.md)** for complete documentation on:

- How to run branch cleanup manually
- Automated cleanup via GitHub Actions
- Configuration options
- Safety features and recovery

**Quick Start:**

```bash
# Preview what would be deleted (dry-run)
npm install
export BRANCH_CLEANUP_TOKEN=your_github_token
npm run branch-cleanup:dry

# View the generated reports
ls -la ops/reports/branch-cleanup/
```

## Canonical Repositories

Part of the **BlackRoad-OS** organization:

| Purpose       | Canonical Repo                                                                           |
| ------------- | ---------------------------------------------------------------------------------------- |
| Core OS       | [blackroad-os-core](https://github.com/BlackRoad-OS/blackroad-os-core)                   |
| Web / UI      | [blackroad-os-web](https://github.com/BlackRoad-OS/blackroad-os-web)                     |
| Operator      | [blackroad-os-operator](https://github.com/BlackRoad-OS/blackroad-os-operator)           |
| Agents        | [blackroad-os-agents](https://github.com/BlackRoad-OS/blackroad-os-agents)               |
| API Gateway   | [blackroad-os-api-gateway](https://github.com/BlackRoad-OS/blackroad-os-api-gateway)     |
| Documentation | [blackroad-os-docs](https://github.com/BlackRoad-OS/blackroad-os-docs)                   |
| Prism Console | [blackroad-os-prism-console](https://github.com/BlackRoad-OS/blackroad-os-prism-console) |

---

🖤 BlackRoad OS
