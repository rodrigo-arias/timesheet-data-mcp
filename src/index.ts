import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";

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
  return checkpoints.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const server = new McpServer({
  name: "work-checkpoints",
  version: "1.0.0",
});

server.tool("get_today_checkpoints", "Returns all checkpoints for today", async () => {
  const all = await loadCheckpoints();
  const today = todayDate();
  const filtered = sortByTimestamp(all.filter((c) => c.date === today));
  return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
});

server.tool(
  "get_checkpoints_by_date",
  "Returns all checkpoints for a given date",
  { date: z.string().describe("Date in YYYY-MM-DD format") },
  async ({ date }) => {
    const all = await loadCheckpoints();
    const filtered = sortByTimestamp(all.filter((c) => c.date === date));
    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
  }
);

server.tool("get_all_checkpoints", "Returns all checkpoints", async () => {
  const all = await loadCheckpoints();
  const sorted = sortByTimestamp(all);
  return { content: [{ type: "text", text: JSON.stringify(sorted, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
