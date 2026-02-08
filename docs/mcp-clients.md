# Using trilium-bolt with other MCP clients

trilium-bolt works with any MCP client that supports the stdio transport. Below are setup instructions for popular tools.

## Prerequisites

For all clients, you'll need:

1. **Node.js 18+** installed
2. **Trilium Notes** running with ETAPI enabled
3. **An ETAPI token** — In Trilium: **Options → ETAPI → Create new ETAPI token**

If Trilium is running on a non-default port or a remote server, also set `TRILIUM_URL` (default: `http://localhost:37840`).

## Cursor

Add to your Cursor MCP config (`.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Windsurf

Add to your Windsurf MCP config (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here"
      }
    }
  }
}
```

## VS Code (Copilot)

Add to your VS Code settings (`.vscode/mcp.json` in your project):

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Cline

Add via the Cline MCP settings UI, or edit the config file directly (`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` on macOS):

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "trilium-bolt"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Continue

Add to your Continue config (`~/.continue/config.yaml`):

```yaml
mcpServers:
  - name: trilium
    command: npx
    args:
      - -y
      - trilium-bolt
    env:
      TRILIUM_TOKEN: your-token-here
```

## Generic MCP client

Any MCP client that supports stdio transport can use trilium-bolt. The key details:

- **Command:** `npx`
- **Args:** `["-y", "trilium-bolt"]`
- **Required env:** `TRILIUM_TOKEN` — your ETAPI token
- **Optional env:** `TRILIUM_URL` — defaults to `http://localhost:37840`

## Troubleshooting

### Connection refused

- Make sure Trilium is running
- Verify the URL: `curl http://localhost:37840/etapi/app-info`
- If using a non-default port, set `TRILIUM_URL`

### Authentication failed

- Double-check your token (easy to miss a character when copying)
- Create a new token in Trilium if unsure — old tokens don't expire but can be revoked

### npx is slow on first run

The first invocation downloads the package. Subsequent runs use the cached version. To avoid this, install globally:

```bash
npm install -g trilium-bolt
```

Then use `"command": "trilium-bolt"` instead of `"command": "npx"` in your config.
