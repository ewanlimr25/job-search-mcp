import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const SEEN_JOBS_FILE = path.join(__dirname, "..", "output", "seen_jobs.json");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

const server = new McpServer({
  name: "job-search",
  version: "1.0.0",
});

// ─── Tool: web_search ─────────────────────────────────────────────────────────

server.tool(
  "web_search",
  "Search the web for job postings using Google (via Serper). Use targeted queries to find listings on LinkedIn, Greenhouse, Lever, Wellfound, and company career pages. Use the page parameter to paginate through additional results (page 1 = results 1-10, page 2 = results 11-20, etc.).",
  {
    query: z.string().describe("Search query, e.g. 'AI agent engineer startup remote Canada site:linkedin.com'"),
    num_results: z.number().min(1).max(10).default(10).describe("Number of results to return per page (max 10)"),
    page: z.number().min(1).default(1).describe("Page number for pagination (default 1). Increment to get more results for the same query."),
  },
  async ({ query, num_results, page }) => {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error("SERPER_API_KEY not set");

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: num_results, page }),
    });

    if (!response.ok) {
      throw new Error(`Serper error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      organic?: Array<{ title: string; link: string; snippet: string }>;
    };

    const results = data.organic ?? [];
    if (results.length === 0) return { content: [{ type: "text", text: `No results found for page ${page}. Do not paginate further for this query.` }] };

    const offset = (page - 1) * num_results;
    const hasMore = results.length === num_results;
    const paginationHint = hasMore
      ? `\n\n[Full page returned (${results.length}/${num_results}). You MAY fetch page ${page + 1} for more results if needed.]`
      : `\n\n[Partial page returned (${results.length}/${num_results}). Do not paginate further for this query — no more results exist.]`;

    const text = [
      `Page ${page} — results ${offset + 1}–${offset + results.length}:`,
      ...results.map((r, i) => `${offset + i + 1}. **${r.title}**\n   URL: ${r.link}\n   ${r.snippet}`),
    ].join("\n\n") + paginationHint;

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: fetch_job_page ─────────────────────────────────────────────────────

server.tool(
  "fetch_job_page",
  "Fetch the full text of a job posting URL to read the complete job description, requirements, and company details.",
  { url: z.string().url().describe("The full URL of the job posting to fetch") },
  async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { content: [{ type: "text", text: `Failed to fetch: ${response.status} ${response.statusText}` }] };
      }

      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s{2,}/g, " ")
        .trim();

      const truncated = text.length > 4000 ? text.slice(0, 4000) + "\n\n[truncated...]" : text;
      return { content: [{ type: "text", text: truncated }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Tool: get_seen_jobs ──────────────────────────────────────────────────────

server.tool(
  "get_seen_jobs",
  "Get the list of job URLs already shown in previous runs. Check this before surfacing results to avoid duplicates.",
  {},
  async () => {
    if (!fs.existsSync(SEEN_JOBS_FILE)) {
      return { content: [{ type: "text", text: "[]" }] };
    }
    const data = fs.readFileSync(SEEN_JOBS_FILE, "utf-8");
    return { content: [{ type: "text", text: data }] };
  }
);

// ─── Tool: save_results ───────────────────────────────────────────────────────

server.tool(
  "save_results",
  "Save the final ranked job results to a dated file (e.g. output/jobs-2026-03-19.md) and append new URLs to the seen jobs log. Call once at the end of a search session.",
  {
    content: z.string().describe("Full formatted markdown of the job results to save"),
    seen_urls: z.array(z.string()).describe("All job URLs found this run, to mark as seen"),
  },
  async ({ content, seen_urls }) => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const datedFile = path.join(OUTPUT_DIR, `jobs-${date}.md`);
    fs.writeFileSync(datedFile, `# Job Search Results — ${date}\n\n${content}`, "utf-8");

    let existing: string[] = [];
    if (fs.existsSync(SEEN_JOBS_FILE)) {
      existing = JSON.parse(fs.readFileSync(SEEN_JOBS_FILE, "utf-8"));
    }
    const merged = Array.from(new Set([...existing, ...seen_urls]));
    fs.writeFileSync(SEEN_JOBS_FILE, JSON.stringify(merged, null, 2), "utf-8");

    return { content: [{ type: "text", text: `Saved ${seen_urls.length} jobs to output/jobs-${date}.md and updated seen jobs log.` }] };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Job Search MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
