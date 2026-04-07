import * as crypto from "node:crypto";
import type Database from "better-sqlite3";

// ── Types ────────────────────────────────────────────────────────────

export interface TimesheetEntry {
  id: string;
  date: string;
  hours: number;
  identifier: string;
  description: string | null;
  category: string;
  created_at: string;
}

export interface EntryInput {
  hours: number;
  identifier: string;
  description: string | null;
  category: string;
}

export interface CategoryRow {
  category: string;
  total_hours: number;
  entry_count: number;
}

export interface WeekCategoryRow {
  week_start: string;
  category: string;
  total_hours: number;
}

export interface CategorySummary {
  period: { start_date: string; end_date: string };
  grand_total_hours: number;
  by_category: {
    category: string;
    total_hours: number;
    entry_count: number;
    percentage: number;
  }[];
  client_work: {
    total_hours: number;
    percentage_of_total: number;
    breakdown: {
      projects: { hours: number; percentage_of_client: number };
      maintenance: { hours: number; percentage_of_client: number };
    };
  };
}

export interface WeekSummary {
  week_start: string;
  week_end: string;
  total_hours: number;
  by_category: Record<string, { hours: number; percentage: number }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export function computeFriday(mondayStr: string): string {
  const d = new Date(`${mondayStr}T00:00:00`);
  d.setDate(d.getDate() + 4);
  return d.toISOString().slice(0, 10);
}

// ── Schema ───────────────────────────────────────────────────────────

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS timesheet_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      identifier TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL CHECK(category IN ('client_project', 'client_maintenance', 'internal_dev', 'non_billable')),
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_timesheet_date ON timesheet_entries(date)`);
}

// ── Operations ───────────────────────────────────────────────────────

export function saveFinalReport(db: Database.Database, date: string, entries: EntryInput[]): TimesheetEntry[] {
  const insertStmt = db.prepare(`
    INSERT INTO timesheet_entries (id, date, hours, identifier, description, category, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteStmt = db.prepare(`DELETE FROM timesheet_entries WHERE date = ?`);

  const transaction = db.transaction(() => {
    deleteStmt.run(date);
    const now = new Date().toISOString();
    for (const entry of entries) {
      insertStmt.run(crypto.randomUUID(), date, entry.hours, entry.identifier, entry.description, entry.category, now);
    }
  });

  transaction();

  return db
    .prepare(`SELECT * FROM timesheet_entries WHERE date = ? ORDER BY category, identifier`)
    .all(date) as TimesheetEntry[];
}

export function updateReportEntry(
  db: Database.Database,
  id: string,
  updates: { hours?: number; identifier?: string; description?: string | null; category?: string },
): { changed: boolean; entry?: TimesheetEntry } {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.hours !== undefined) {
    fields.push("hours = ?");
    values.push(updates.hours);
  }
  if (updates.identifier !== undefined) {
    fields.push("identifier = ?");
    values.push(updates.identifier);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category);
  }

  if (fields.length === 0) return { changed: false };

  values.push(id);
  const result = db.prepare(`UPDATE timesheet_entries SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (result.changes === 0) return { changed: false };

  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id = ?`).get(id) as TimesheetEntry;
  return { changed: true, entry };
}

export function getReportByDate(db: Database.Database, date: string): TimesheetEntry[] {
  return db
    .prepare(`SELECT * FROM timesheet_entries WHERE date = ? ORDER BY category, identifier`)
    .all(date) as TimesheetEntry[];
}

export function getReportsByRange(db: Database.Database, startDate: string, endDate: string): TimesheetEntry[] {
  return db
    .prepare(`SELECT * FROM timesheet_entries WHERE date >= ? AND date <= ? ORDER BY date, category, identifier`)
    .all(startDate, endDate) as TimesheetEntry[];
}

export function getCategorySummary(db: Database.Database, startDate: string, endDate: string): CategorySummary {
  const rows = db
    .prepare(`
    SELECT category, SUM(hours) as total_hours, COUNT(*) as entry_count
    FROM timesheet_entries
    WHERE date >= ? AND date <= ?
    GROUP BY category
    ORDER BY total_hours DESC
  `)
    .all(startDate, endDate) as CategoryRow[];

  const grandTotal = rows.reduce((sum, r) => sum + r.total_hours, 0);

  const clientProject = rows.find((r) => r.category === "client_project")?.total_hours ?? 0;
  const clientMaintenance = rows.find((r) => r.category === "client_maintenance")?.total_hours ?? 0;
  const clientTotal = clientProject + clientMaintenance;

  return {
    period: { start_date: startDate, end_date: endDate },
    grand_total_hours: grandTotal,
    by_category: rows.map((r) => ({
      category: r.category,
      total_hours: r.total_hours,
      entry_count: r.entry_count,
      percentage: pct(r.total_hours, grandTotal),
    })),
    client_work: {
      total_hours: clientTotal,
      percentage_of_total: pct(clientTotal, grandTotal),
      breakdown: {
        projects: { hours: clientProject, percentage_of_client: pct(clientProject, clientTotal) },
        maintenance: { hours: clientMaintenance, percentage_of_client: pct(clientMaintenance, clientTotal) },
      },
    },
  };
}

export function getWeeklySummary(db: Database.Database, startDate: string, endDate: string): WeekSummary[] {
  const rows = db
    .prepare(`
    SELECT
      date(date, '-' || ((strftime('%w', date) + 6) % 7) || ' days') as week_start,
      category,
      SUM(hours) as total_hours
    FROM timesheet_entries
    WHERE date >= ? AND date <= ?
    GROUP BY week_start, category
    ORDER BY week_start, category
  `)
    .all(startDate, endDate) as WeekCategoryRow[];

  const weeks = new Map<string, WeekCategoryRow[]>();
  for (const row of rows) {
    if (!weeks.has(row.week_start)) weeks.set(row.week_start, []);
    weeks.get(row.week_start)?.push(row);
  }

  return Array.from(weeks.entries()).map(([week_start, categories]) => {
    const weekTotal = categories.reduce((s, c) => s + c.total_hours, 0);
    return {
      week_start,
      week_end: computeFriday(week_start),
      total_hours: weekTotal,
      by_category: Object.fromEntries(
        categories.map((c) => [c.category, { hours: c.total_hours, percentage: pct(c.total_hours, weekTotal) }]),
      ),
    };
  });
}
