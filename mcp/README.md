# Sitku Notes — MCP server

Exposes your local **Sitku notes vault** to any MCP-capable agentic AI (Claude Desktop, Claude
Code, Cline, Cursor, …) so it can search, read, and write the same Markdown notes the desktop app
edits — directly on disk.

- **Zero dependencies.** Just Node ≥ 18. No `npm install`, nothing to break.
- **Local only.** Reads/writes files + IndexedDB on your machine. Never talks to the network.
- **Notes anywhere; finance/consultant when the app is open.** Notes are files on disk (work from the
  standalone stdio server too). Personal CFO + Agent Consultant data live in the app's IndexedDB, so
  those tools are served by the **app-hosted** endpoint and need a Sitku window open.

## What it can do

**Notes** (available in both stdio + app-hosted):

| Tool | Purpose |
|------|---------|
| `get_vault_info` | Report the active vault path + note count |
| `list_notes` | List notes (path, title, modified); optional folder filter |
| `search_notes` | Full-text search title + body, returns snippets |
| `read_note` | Read a note by path **or** title |
| `create_note` | Create a note (by path or title); won't overwrite unless told |
| `update_note` | Replace content, or append text to a note |

**Personal CFO + Agent Consultant** (app-hosted only — needs a Sitku window open):

| Tool | Purpose |
|------|---------|
| `finance_summary` | Income / expense / net over a date range |
| `finance_list_transactions` | Recent transactions (filter by type + range) |
| `finance_add_transaction` | Record an income or expense |
| `consultant_summary` | Content dashboard — posts, views, engagement, followers, per-platform |
| `consultant_list_posts` | Recent posts with metrics |
| `consultant_top_posts` | Top posts by engagement / views |
| `consultant_add_revenue` | Log a revenue entry (USDT) |

There is deliberately **no delete tool** — destructive edits stay in the app.

## Which vault?

Resolved in this order:

1. `--vault <path>` argument
2. `SITKU_VAULT` environment variable
3. `~/.sitku/workspace.json` → `"workspace.vaultPath"` (the app's active vault)
4. `~/.sitku/vault` (the app default)

So with the desktop app installed, it targets your real vault automatically.

## Two ways to run it

**A. App-hosted (recommended) — the desktop app runs it for you.**
When the Sitku desktop app is open it hosts an MCP endpoint over HTTP on localhost. No terminal.
- **Settings → General → MCP server**: a toggle (on/off), the endpoint URL, and a list of **per-client
  access tokens** — one per agentic AI, each with live activity (last used · request count) and a
  **Revoke** button. "Add client" mints a token and shows one-click copy for Claude Code + Codex.
- Each client authenticates with its **own** token, so you can revoke one AI without affecting others.
- Bound to `127.0.0.1` only, Bearer-token auth per request, cross-origin blocked (DNS-rebind guard).
- State + tokens persist in `~/.sitku/mcp.json`.

Connect examples (grab `<url>` + that client's `<token>` from the Settings card):
```bash
# Claude Code (HTTP)
claude mcp add --transport http sitku-notes <url> --header "Authorization: Bearer <token>"
```
```toml
# Codex — ~/.codex/config.toml  (HTTP transport)
[mcp_servers.sitku-notes]
url = "<url>"
bearer_token_env_var = "SITKU_MCP_TOKEN"
# then in your shell:  export SITKU_MCP_TOKEN=<token>
```
Cursor / Cline: add an HTTP/streamable-http MCP server with the same `<url>` and an
`Authorization: Bearer <token>` header.

**B. Standalone (stdio) — you run it yourself.** For clients that spawn a local command (Claude
Desktop config below). Works even when the app isn't running; no token (stdio is locally trusted).
Codex stdio alternative:
```toml
# ~/.codex/config.toml
[mcp_servers.sitku-notes]
command = "node"
args = ["/Users/zoe/Downloads/beebot/cute-ai-agent/mcp/sitku-mcp.mjs"]
```

## Connect the standalone (stdio) server

The server path on this machine:

```
/Users/zoe/Downloads/beebot/cute-ai-agent/mcp/sitku-mcp.mjs
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "sitku-notes": {
      "command": "node",
      "args": ["/Users/zoe/Downloads/beebot/cute-ai-agent/mcp/sitku-mcp.mjs"]
    }
  }
}
```

Restart Claude Desktop. To pin a specific vault, add `"env": { "SITKU_VAULT": "/path/to/vault" }`.

### Claude Code

```bash
claude mcp add sitku-notes -- node /Users/zoe/Downloads/beebot/cute-ai-agent/mcp/sitku-mcp.mjs
```

Or add to a project `.mcp.json`:

```json
{
  "mcpServers": {
    "sitku-notes": {
      "command": "node",
      "args": ["/Users/zoe/Downloads/beebot/cute-ai-agent/mcp/sitku-mcp.mjs"]
    }
  }
}
```

### Cline / Cursor / other MCP clients

Use the same shape — command `node`, arg the absolute path to `sitku-mcp.mjs`.

## Verify by hand

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node mcp/sitku-mcp.mjs
```

You should see an `initialize` result and the tool list. Logs go to **stderr**; the protocol speaks
on **stdout** (never mix them).
