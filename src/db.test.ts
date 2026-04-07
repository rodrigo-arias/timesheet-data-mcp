import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import Database from "better-sqlite3";
import {
  computeFriday,
  getCategorySummary,
  getReportByDate,
  getReportsByRange,
  getWeeklySummary,
  initSchema,
  saveFinalReport,
  type TimesheetEntry,
  updateReportEntry,
} from "./db.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

const SAMPLE_ENTRIES = [
  { hours: 3, identifier: "PROJ-101", description: "Implement login flow", category: "client_project" },
  { hours: 1.5, identifier: "MAINT-42", description: null, category: "client_maintenance" },
  { hours: 2, identifier: "Internal tooling", description: "Dashboard improvements", category: "internal_dev" },
  { hours: 1, identifier: "Admin tasks", description: null, category: "non_billable" },
];

describe("saveFinalReport + getReportByDate", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
  });

  it("saves entries and reads them back", () => {
    const saved = saveFinalReport(db, "2026-04-06", SAMPLE_ENTRIES);
    assert.equal(saved.length, 4);

    const retrieved = getReportByDate(db, "2026-04-06");
    assert.equal(retrieved.length, 4);

    // Verify all fields round-trip correctly
    const project = retrieved.find((e) => e.identifier === "PROJ-101")!;
    assert.equal(project.hours, 3);
    assert.equal(project.description, "Implement login flow");
    assert.equal(project.category, "client_project");
    assert.equal(project.date, "2026-04-06");
    assert.ok(project.id);
    assert.ok(project.created_at);
  });

  it("replaces existing entries for the same date", () => {
    saveFinalReport(db, "2026-04-06", SAMPLE_ENTRIES);
    assert.equal(getReportByDate(db, "2026-04-06").length, 4);

    const replacement = [{ hours: 8, identifier: "New task", description: "Replaced", category: "client_project" }];
    saveFinalReport(db, "2026-04-06", replacement);

    const entries = getReportByDate(db, "2026-04-06");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].identifier, "New task");
    assert.equal(entries[0].hours, 8);
  });

  it("does not affect other dates when replacing", () => {
    saveFinalReport(db, "2026-04-06", SAMPLE_ENTRIES);
    saveFinalReport(db, "2026-04-07", [
      { hours: 4, identifier: "Monday task", description: null, category: "internal_dev" },
    ]);

    // Replace only April 6
    saveFinalReport(db, "2026-04-06", [
      { hours: 7, identifier: "Replaced", description: null, category: "non_billable" },
    ]);

    assert.equal(getReportByDate(db, "2026-04-06").length, 1);
    assert.equal(getReportByDate(db, "2026-04-07").length, 1);
    assert.equal(getReportByDate(db, "2026-04-07")[0].identifier, "Monday task");
  });

  it("returns empty array for date with no entries", () => {
    assert.deepEqual(getReportByDate(db, "2026-01-01"), []);
  });
});

describe("updateReportEntry", () => {
  let db: Database.Database;
  let entries: TimesheetEntry[];

  beforeEach(() => {
    db = createTestDb();
    entries = saveFinalReport(db, "2026-04-06", SAMPLE_ENTRIES);
  });

  it("updates a single field", () => {
    const target = entries.find((e) => e.identifier === "PROJ-101")!;
    const result = updateReportEntry(db, target.id, { hours: 5 });

    assert.ok(result.changed);
    assert.equal(result.entry?.hours, 5);
    assert.equal(result.entry?.identifier, "PROJ-101"); // unchanged
    assert.equal(result.entry?.description, "Implement login flow"); // unchanged
  });

  it("updates multiple fields at once", () => {
    const target = entries[0];
    const result = updateReportEntry(db, target.id, {
      hours: 2,
      identifier: "New ID",
      description: "New desc",
      category: "non_billable",
    });

    assert.ok(result.changed);
    assert.equal(result.entry?.hours, 2);
    assert.equal(result.entry?.identifier, "New ID");
    assert.equal(result.entry?.description, "New desc");
    assert.equal(result.entry?.category, "non_billable");
  });

  it("can set description to null", () => {
    const target = entries.find((e) => e.description === "Implement login flow")!;
    const result = updateReportEntry(db, target.id, { description: null });

    assert.ok(result.changed);
    assert.equal(result.entry?.description, null);
  });

  it("returns changed: false for nonexistent id", () => {
    const result = updateReportEntry(db, "nonexistent-uuid", { hours: 1 });
    assert.equal(result.changed, false);
    assert.equal(result.entry, undefined);
  });

  it("returns changed: false when no fields provided", () => {
    const result = updateReportEntry(db, entries[0].id, {});
    assert.equal(result.changed, false);
  });

  it("does not affect other entries", () => {
    const target = entries[0];
    const other = entries[1];
    updateReportEntry(db, target.id, { hours: 99 });

    const otherAfter = getReportByDate(db, "2026-04-06").find((e) => e.id === other.id)!;
    assert.equal(otherAfter.hours, other.hours);
    assert.equal(otherAfter.identifier, other.identifier);
  });
});

describe("getReportsByRange", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    saveFinalReport(db, "2026-04-06", [
      { hours: 4, identifier: "Sunday", description: null, category: "client_project" },
    ]);
    saveFinalReport(db, "2026-04-07", [
      { hours: 8, identifier: "Monday", description: null, category: "internal_dev" },
    ]);
    saveFinalReport(db, "2026-04-08", [
      { hours: 6, identifier: "Tuesday", description: null, category: "non_billable" },
    ]);
  });

  it("returns entries within the range (inclusive)", () => {
    const entries = getReportsByRange(db, "2026-04-06", "2026-04-08");
    assert.equal(entries.length, 3);
  });

  it("filters correctly with a partial range", () => {
    const entries = getReportsByRange(db, "2026-04-07", "2026-04-07");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].identifier, "Monday");
  });

  it("returns empty for range with no data", () => {
    const entries = getReportsByRange(db, "2026-01-01", "2026-01-31");
    assert.equal(entries.length, 0);
  });
});

describe("getCategorySummary", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    saveFinalReport(db, "2026-04-06", SAMPLE_ENTRIES);
  });

  it("groups hours by category", () => {
    const summary = getCategorySummary(db, "2026-04-06", "2026-04-06");
    assert.equal(summary.by_category.length, 4);

    const project = summary.by_category.find((r) => r.category === "client_project")!;
    assert.equal(project.total_hours, 3);
    assert.equal(project.entry_count, 1);
  });

  it("sums hours across multiple days", () => {
    saveFinalReport(db, "2026-04-07", [
      { hours: 5, identifier: "More project", description: null, category: "client_project" },
    ]);

    const summary = getCategorySummary(db, "2026-04-06", "2026-04-07");
    const project = summary.by_category.find((r) => r.category === "client_project")!;
    assert.equal(project.total_hours, 8); // 3 + 5
  });

  it("computes percentages correctly", () => {
    const summary = getCategorySummary(db, "2026-04-06", "2026-04-06");
    assert.equal(summary.grand_total_hours, 7.5); // 3 + 1.5 + 2 + 1

    const project = summary.by_category.find((r) => r.category === "client_project")!;
    assert.equal(project.percentage, 40); // 3 / 7.5 = 0.4
  });

  it("splits client work into projects vs maintenance", () => {
    const summary = getCategorySummary(db, "2026-04-06", "2026-04-06");
    assert.equal(summary.client_work.total_hours, 4.5); // 3 + 1.5
    assert.equal(summary.client_work.breakdown.projects.hours, 3);
    assert.equal(summary.client_work.breakdown.maintenance.hours, 1.5);
  });
});

describe("getWeeklySummary", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
    // Week 1: Mon Apr 6 - Fri Apr 10, 2026
    saveFinalReport(db, "2026-04-06", [
      { hours: 4, identifier: "A", description: null, category: "client_project" },
      { hours: 2, identifier: "B", description: null, category: "internal_dev" },
    ]);
    saveFinalReport(db, "2026-04-08", [{ hours: 3, identifier: "C", description: null, category: "client_project" }]);
    // Week 2: Mon Apr 13 - Fri Apr 17, 2026
    saveFinalReport(db, "2026-04-13", [{ hours: 8, identifier: "D", description: null, category: "non_billable" }]);
  });

  it("groups entries by week", () => {
    const weeks = getWeeklySummary(db, "2026-04-06", "2026-04-17");
    assert.equal(weeks.length, 2);
    assert.equal(weeks[0].week_start, "2026-04-06");
    assert.equal(weeks[0].week_end, "2026-04-10");
    assert.equal(weeks[1].week_start, "2026-04-13");
    assert.equal(weeks[1].week_end, "2026-04-17");
  });

  it("sums hours within a week across days", () => {
    const weeks = getWeeklySummary(db, "2026-04-06", "2026-04-10");
    assert.equal(weeks[0].by_category.client_project.hours, 7); // 4 + 3
    assert.equal(weeks[0].by_category.internal_dev.hours, 2);
    assert.equal(weeks[0].total_hours, 9);
  });
});

describe("computeFriday", () => {
  it("returns Friday for a Monday date", () => {
    assert.equal(computeFriday("2026-04-06"), "2026-04-10");
  });

  it("handles month boundary", () => {
    assert.equal(computeFriday("2026-03-30"), "2026-04-03");
  });

  it("handles year boundary", () => {
    assert.equal(computeFriday("2025-12-29"), "2026-01-02");
  });
});
