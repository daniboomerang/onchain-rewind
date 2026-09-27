@AGENTS.md

# Claude Code specifics

- **Never commit unless the user explicitly asks in that message.** Never add co-author trailers or any Claude attribution to commits, PRs or code. The code belongs to the repo owner.
- **Path rules load automatically** from `.claude/rules/` when you touch matching files. Workflow skills (`/verify-ui`, `/vet-demo-wallet`, `/record-fixture`, `/ship-check`) are invoked on demand.
- **Plan mode** (`/plan` or Shift+Tab) for multi-file tranche tasks. Direct execution for single fixes. Use the Explore subagent for wide codebase searches, to keep the main context clean.
- **Zerion docs through MCP** once `.mcp.json` includes the Zerion server (SPEC.md §9). Confirm endpoint parameters there before writing API code.
- **Personal notes** go in `CLAUDE.local.md`, which is gitignored and never committed.
