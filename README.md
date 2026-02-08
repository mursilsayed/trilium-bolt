# trilium-bolt

Lightning-fast MCP server for [Trilium Notes](https://github.com/zadam/trilium). Connect Claude to your personal knowledge base with minimal setup.

## Quick Start

### 1. Get your Trilium token

In Trilium: **Options → ETAPI → Create new ETAPI token**

### 2. Configure Claude Code to use the MCP server

Add to your `~/.claude.json`:

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

> **Not using Claude Code?** See setup instructions for [Cursor, Windsurf, VS Code, Cline, and other MCP clients](docs/mcp-clients.md)
>
> **Running Trilium in Docker?** See the [Docker Setup Guide](docs/docker.md)


### 3. Use it

```
You: Search my notes for "project ideas"
You: Create a new note called "Meeting Notes" under my Work folder
You: What's in my daily journal from last week?
```

That's it!

## Why Lightweight?

Unlike traditional servers, trilium-bolt uses **stdio transport** - meaning:

- **On-demand execution** - Only runs when Claude needs it, not a 24/7 daemon
- **Zero network ports** - No HTTP server, no port conflicts, no firewall rules
- **Minimal memory** - ~20-30MB when active, 0MB when idle
- **No background processes** - Spawned by Claude, terminates when done
- **Instant startup** - No container spin-up, just a Node.js process

### How it works

```
┌──────────────┐     stdin/stdout      ┌─────────────┐     ETAPI      ┌─────────────┐
│  MCP Client  │ ◄──────────────────► │ trilium-bolt │ ◄────────────► │  Trilium    │
│ (Claude Code,│                       └─────────────┘                └─────────────┘
│  Cursor, etc)│                        Runs on-demand                 Your notes
└──────────────┘                        No daemon                      Local app
```

This is the simplest possible architecture - just a CLI that your MCP client invokes when you ask about your notes.

## Tools

| Tool | Description |
|------|-------------|
| `search_notes` | Full-text and attribute search |
| `get_note` | Retrieve note content and metadata |
| `get_note_tree` | Get children/hierarchy of a note |
| `create_note` | Create a new note |
| `update_note` | Update note title or content |
| `delete_note` | Delete a note |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRILIUM_TOKEN` | Yes | - | Your ETAPI token |
| `TRILIUM_URL` | No | `http://localhost:37840` | Trilium server URL |

## Examples

**Search notes:**
```
Search my Trilium notes for anything about "machine learning"
```

**Create a note:**
```
Create a note titled "Book Notes: Atomic Habits" with a summary of the key points
```

**Explore hierarchy:**
```
Show me the structure of my "Projects" folder
```

## Building from source

```bash
git clone https://github.com/mursilsayed/trilium-bolt.git
cd trilium-bolt
npm install
npm run build
```

To use your local build instead of the published package, point your MCP client to the built output:

```json
{
  "mcpServers": {
    "trilium": {
      "command": "node",
      "args": ["/absolute/path/to/trilium-bolt/dist/index.js"],
      "env": {
        "TRILIUM_TOKEN": "your-token-here"
      }
    }
  }
}
```

For development, use `npm run dev` to rebuild on file changes.

## Requirements

- Node.js 18+
- Trilium Notes running with ETAPI enabled

## License

MIT
