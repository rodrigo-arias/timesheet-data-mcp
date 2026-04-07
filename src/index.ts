import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  getCategorySummary,
  getReportByDate,
  getReportsByRange,
  getWeeklySummary,
  initSchema,
  saveFinalReport,
  updateReportEntry,
} from "./db.js";

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// ── Checkpoints (JSON file) ──────────────────────────────────────────

if (!process.env.CHECKPOINTS_PATH) {
  console.error("CHECKPOINTS_PATH environment variable is required");
  process.exit(1);
}
const CHECKPOINTS_PATH: string = process.env.CHECKPOINTS_PATH;

interface Checkpoint {
  id: string;
  timestamp: string;
  description: string;
  date: string;
}

async function loadCheckpoints(): Promise<Checkpoint[]> {
  try {
    const data = await readFile(CHECKPOINTS_PATH, "utf-8");
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function sortByTimestamp(checkpoints: Checkpoint[]): Checkpoint[] {
  return checkpoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ── Timesheet database (SQLite) ──────────────────────────────────────

const TIMESHEET_DB_PATH =
  process.env.TIMESHEET_DB_PATH ??
  path.join(os.homedir(), "Library", "Application Support", "timesheet-assistant", "timesheet.db");

function initDatabase(): Database.Database {
  const dir = path.dirname(TIMESHEET_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(TIMESHEET_DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

const db = initDatabase();

const CategoryEnum = z.enum(["client_project", "client_maintenance", "internal_dev", "non_billable"]);

// ── Server ───────────────────────────────────────────────────────────

const server = new McpServer({
  name: "timesheet-data",
  version: "2.0.0",
});

// ── Checkpoint tools ─────────────────────────────────────────────────

server.tool("get_today_checkpoints", "Returns all checkpoints for today", async () => {
  const all = await loadCheckpoints();
  const today = todayDate();
  return jsonResponse(sortByTimestamp(all.filter((c) => c.date === today)));
});

server.tool(
  "get_checkpoints_by_date",
  "Returns all checkpoints for a given date",
  { date: z.string().describe("Date in YYYY-MM-DD format") },
  async ({ date }) => {
    const all = await loadCheckpoints();
    return jsonResponse(sortByTimestamp(all.filter((c) => c.date === date)));
  },
);

server.tool("get_all_checkpoints", "Returns all checkpoints", async () => {
  return jsonResponse(sortByTimestamp(await loadCheckpoints()));
});

// ── Timesheet tools ──────────────────────────────────────────────────

server.tool(
  "save_final_report",
  "Save a finalized timesheet report for a date. Replaces any existing entries for that date.",
  {
    date: z.string().describe("Date in YYYY-MM-DD format"),
    entries: z
      .array(
        z.object({
          hours: z.number().positive().describe("Hours worked"),
          identifier: z.string().describe("Task identifier"),
          description: z.string().nullable().describe("Optional description of work done"),
          category: CategoryEnum.describe("Category of work"),
        }),
      )
      .min(1)
      .describe("Array of timesheet entries"),
  },
  async ({ date, entries }) => {
    const saved = saveFinalReport(db, date, entries);
    return jsonResponse({ saved: saved.length, entries: saved });
  },
);

server.tool(
  "update_report_entry",
  "Update one or more fields of an existing timesheet entry by ID.",
  {
    id: z.string().describe("UUID of the entry to update"),
    hours: z.number().positive().optional().describe("New hours value"),
    identifier: z.string().optional().describe("New task identifier"),
    description: z.string().nullable().optional().describe("New description"),
    category: CategoryEnum.optional().describe("New category"),
  },
  async ({ id, hours, identifier, description, category }) => {
    const result = updateReportEntry(db, id, { hours, identifier, description, category });

    if (!result.changed) {
      const exists = db.prepare(`SELECT id FROM timesheet_entries WHERE id = ?`).get(id);
      if (!exists) return jsonResponse({ error: `No entry found with id: ${id}` });
      return jsonResponse({ error: "No fields provided to update." });
    }

    return jsonResponse(result.entry);
  },
);

server.tool(
  "get_report_by_date",
  "Get all timesheet entries for a specific date",
  { date: z.string().describe("Date in YYYY-MM-DD format") },
  async ({ date }) => jsonResponse(getReportByDate(db, date)),
);

server.tool(
  "get_reports_by_range",
  "Get all timesheet entries within a date range (inclusive)",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => jsonResponse(getReportsByRange(db, start_date, end_date)),
);

server.tool(
  "get_category_summary",
  "Get hours and percentage breakdown by category for a date range. Client work is split into projects vs maintenance.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => jsonResponse(getCategorySummary(db, start_date, end_date)),
);

server.tool(
  "get_weekly_summary",
  "Get category breakdown grouped by week (Mon-Fri) for trend visualization. Returns data suitable for a stacked bar chart.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ start_date, end_date }) => jsonResponse(getWeeklySummary(db, start_date, end_date)),
);

// ── Start ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
