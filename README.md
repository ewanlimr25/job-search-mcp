# job-search-mcp

An MCP (Model Context Protocol) server that gives Claude Code the tools to search for jobs, track seen listings, and save results. No Anthropic API key needed — Claude Code acts as the brain.

Pairs with [company-research-mcp](https://github.com/ewanlimr25/company-research-mcp) for deep-dive company and role research.

---

## Tools

| Tool | Description |
|---|---|
| `web_search` | Search the web for job postings via Google (Serper) |
| `fetch_job_page` | Fetch the full text of a job posting URL |
| `get_seen_jobs` | Load previously seen job URLs to avoid duplicates |
| `save_results` | Save ranked results to `output/jobs.md` and update the seen jobs cache |

---

## Setup

### 1. Get a Serper API Key

1. Go to [serper.dev](https://serper.dev) and sign up (Google login works)
2. Your API key is shown on the dashboard — free tier includes 2,500 queries/month

### 2. Clone and Install

```bash
git clone https://github.com/ewanlimr25/job-search-mcp.git
cd job-search-mcp
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and add your Serper key:

```
SERPER_API_KEY=your_serper_api_key_here
```

### 4. Build

```bash
npm run build
```

### 5. Register with Claude Code

```bash
claude mcp add job-search -s user -- node /absolute/path/to/job-search-mcp/dist/index.js
```

Replace `/absolute/path/to/` with the actual path where you cloned the repo.

Restart Claude Code to load the server.

---

## Standalone Usage

Once registered, open any Claude Code session and ask:

> "Search for AI engineer jobs at startups in Canada. Check seen jobs first, skip duplicates, and save results when done."

Claude will call the tools in sequence and write results to `output/jobs.md`.

---

## Usage with job-search-workspace

For a full two-stage workflow (search + company research), use this alongside [company-research-mcp](https://github.com/ewanlimr25/company-research-mcp) via the [job-search-workspace](https://github.com/ewanlimr25/job-search-workspace). The workspace CLAUDE.md wires both MCPs together with your profile and scoring criteria.

---

## Output

Results are saved locally in the `output/` directory (gitignored):

- `output/jobs.md` — today's ranked job listings
- `output/seen_jobs.json` — cache of all URLs ever surfaced, checked on every run to avoid duplicates
