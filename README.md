# mindsplosion

A dashboard for your mind-explosion: handling all the ideas and repos you're producing with AI so they're not just chaos.

## Development

The local development database is SQLite and requires no database server or `.env` file.

```bash
pnpm install
pnpm dev
```

By default the database is created at `.data/mindsplosion.sqlite`. The schema is initialized automatically from the canonical migration in `db/migrations/001_initial.sql`.

To use another SQLite file:

```bash
MINDSPLOSION_DB_PATH=/path/to/mindsplosion.sqlite pnpm dev
```

`DATABASE_URL` is only needed when using PostgreSQL. Set it to a `postgres://` or `postgresql://` URL and the same database layer will use PostgreSQL instead of SQLite.

The `dev` command starts the Mindsplosion MCP server over stdio.

## Commands

- `pnpm dev` — start the local MCP server with SQLite
- `pnpm mcp` — start the MCP server
- `pnpm test` — run tests
- `pnpm typecheck` — run TypeScript type checking
