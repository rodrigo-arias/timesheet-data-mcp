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
      "args": ["/path/to/work-checkpoints-mcp/dist/index.js"],
      "env": {
        "CHECKPOINTS_PATH": "/path/to/checkpoints.json"
      }
    }
  }
}
```

`CHECKPOINTS_PATH` is required — it should point to the `checkpoints.json` file synced by the Raycast extension.
