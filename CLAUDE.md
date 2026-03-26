# agentctl Development

## Architecture

ESM-only TypeScript project targeting Node 20+. CLI-first tool for analyzing MCP server configurations.

- CLI commands in `src/cli/`, each registering with Commander
- Config discovery in `src/config/`, MCP client in `src/mcp/`
- Analysis pipeline: scan → budget → analysis → workspace → report
- Output: terminal (chalk + cli-table3), JSON, and file artifacts to `.agentctl/latest/`

## Conventions

- Use zod schemas for all external data validation (`src/config/schemas.ts`)
- Use `ora` spinners for long-running operations
- Use `chalk` for colored terminal output
- Export pure functions; side effects only in CLI command handlers
- All async operations use proper error handling with typed diagnostics
- Types are centralized in `src/types.ts`

## Testing

- Unit tests: `tests/*.test.ts`
- Integration tests: `tests/integration/*.test.ts` (use mock MCP servers)
- E2E tests: `tests/e2e/*.test.ts` (spawn CLI process)
- Fixtures in `tests/fixtures/`
- Mock MCP server: `tests/fixtures/mock-server.ts`

## Build & Run

```bash
pnpm build        # tsup → dist/
pnpm test         # vitest
pnpm dev <cmd>    # tsx dev runner (e.g., pnpm dev plan --json)
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
```
