# Work Checkpoints MCP

MCP server that exposes work checkpoints to Claude Desktop. Reads checkpoints logged via the [Work Checkpoints](https://github.com/rodrigo-arias/work-checkpoints) Raycast extension.

## Tools

- `get_today_checkpoints` — returns all checkpoints for today
- `get_checkpoints_by_date` — returns checkpoints for a given date (YYYY-MM-DD)
- `get_all_checkpoints` — returns all checkpoints

## Setup

```bash
npm install
npm run build
```

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "work-checkpoints": {
      "command": "node",
      "args": ["/path/to/work-checkpoints-mcp/dist/index.js"]
    }
  }
}
```

Optionally override the checkpoints file path:

```json
{
  "mcpServers": {
    "work-checkpoints": {
      "command": "node",
      "args": ["/path/to/work-checkpoints-mcp/dist/index.js"],
      "env": {
        "CHECKPOINTS_PATH": "/custom/path/checkpoints.json"
      }
    }
  }
}
```
