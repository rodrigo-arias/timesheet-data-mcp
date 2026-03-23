# Work Checkpoints MCP

MCP server that exposes work checkpoints to Claude Desktop. Part of a personal AI-powered time tracking system — reads checkpoints logged via the [Work Checkpoints](https://github.com/rodrigo-arias/work-checkpoints) Raycast extension and makes them available as tools for Claude to query and build timesheets from.

## How it fits together
```
┌─────────────────────┐
│  Raycast Extension  │  ← work-checkpoints
│  (logs checkpoints) │
└────────┬────────────┘
         │ writes
         ▼
   checkpoints.json     ← flat file, local only
         │
         │ reads
         ▼
┌─────────────────────┐
│   MCP Server        │  ← this repo
│   (this repo)       │
└────────┬────────────┘
         │ exposes tools to
         ▼
   Claude Desktop       ← generates timesheet from checkpoints
```

## Tools

| Tool | Description |
|---|---|
| `get_today_checkpoints` | Returns all checkpoints for today |
| `get_checkpoints_by_date` | Returns checkpoints for a given date (`YYYY-MM-DD`) |
| `get_all_checkpoints` | Returns all checkpoints |

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

`CHECKPOINTS_PATH` is required — point it to the `checkpoints.json` file synced by the Raycast extension. You can copy the exact path from the extension using the `Copy JSON File Path` action in the List Checkpoints command.

## Related

- [work-checkpoints](https://github.com/rodrigo-arias/work-checkpoints) — Raycast extension that logs the checkpoints