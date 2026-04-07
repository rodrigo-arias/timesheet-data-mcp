# Timesheet Data MCP

MCP server that provides work checkpoint querying and timesheet report storage for AI assistants. Part of a personal AI-powered time tracking system — reads checkpoints logged via the [Work Checkpoints](https://github.com/rodrigo-arias/work-checkpoints) Raycast extension and stores finalized timesheet reports in a local SQLite database.

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
         │
         │ saves finalized reports
         ▼
     timesheet.db       ← SQLite database
```

## Tools

### Checkpoint tools (read from JSON)

| Tool | Description |
|---|---|
| `get_today_checkpoints` | Returns all checkpoints for today |
| `get_checkpoints_by_date` | Returns checkpoints for a given date |
| `get_all_checkpoints` | Returns all checkpoints |

### Timesheet tools (read/write SQLite)

| Tool | Description |
|---|---|
| `save_final_report` | Save a finalized report for a date (replaces any existing entries) |
| `update_report_entry` | Update one or more fields of an existing entry by ID |
| `get_report_by_date` | Get all entries for a specific date |
| `get_reports_by_range` | Get all entries within a date range |
| `get_category_summary` | Hours and percentage breakdown by category, with client work split |
| `get_weekly_summary` | Category breakdown grouped by week (Mon–Fri) for trend charts |

### Categories

Entries are classified as: `client_project`, `client_maintenance`, `internal_dev`, or `non_billable`.

## Setup

```bash
npm install
npm run build
```

Add to your Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "timesheet-data": {
      "command": "node",
      "args": ["/path/to/timesheet-data-mcp/dist/index.js"],
      "env": {
        "CHECKPOINTS_PATH": "/path/to/checkpoints.json"
      }
    }
  }
}
```

- `CHECKPOINTS_PATH` (required) — path to the `checkpoints.json` file synced by the Raycast extension
- `TIMESHEET_DB_PATH` (optional) — defaults to `~/Library/Application Support/timesheet-assistant/timesheet.db`

The database and table are created automatically on first run.

## Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run lint` | Check for lint and format issues |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Auto-format source files |

## Related

- [work-checkpoints](https://github.com/rodrigo-arias/work-checkpoints) — Raycast extension that logs the checkpoints
