import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const TABLE_NAME = "BookmarkChangeTracker";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const dynamo = new DynamoDBClient({ region: REGION });

// ---------------------------------------------------------------------------
// DynamoDB
// ---------------------------------------------------------------------------

async function fetchBookmarks() {
  const items = [];
  let lastKey;

  do {
    const cmd = new ScanCommand({
      TableName: TABLE_NAME,
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });
    const res = await dynamo.send(cmd);
    (res.Items ?? []).forEach((i) => items.push(unmarshall(i)));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  // Strip lastHash — never expose it publicly
  return items.map(({ lastHash: _ignored, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// JSON API  GET /api/bookmarks
// ---------------------------------------------------------------------------

function apiResponse(bookmarks) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    },
    body: JSON.stringify({ bookmarks }),
  };
}

// ---------------------------------------------------------------------------
// HTML Dashboard  GET /
// ---------------------------------------------------------------------------

function htmlResponse() {
  const html = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bookmark Change Tracker</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --green: #22c55e;
    --green-bg: #052e16;
    --green-border: #166534;
    --red: #f97316;
    --red-bg: #1c0a00;
    --red-border: #7c2d12;
    --gray: #64748b;
    --gray-bg: #0f172a;
    --gray-border: #1e293b;
    --accent: #6366f1;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    padding: 2rem 1rem;
  }

  header {
    text-align: center;
    margin-bottom: 2.5rem;
  }

  header h1 {
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #e2e8f0 30%, #6366f1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  header p {
    color: var(--muted);
    margin-top: 0.5rem;
    font-size: 1rem;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 2.5rem;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.2rem 1.8rem;
    text-align: center;
    min-width: 120px;
  }

  .stat-card .value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-card .label {
    color: var(--muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 0.4rem;
  }

  .stat-card.total .value  { color: var(--accent); }
  .stat-card.unchanged .value { color: var(--green); }
  .stat-card.changed .value   { color: var(--red); }
  .stat-card.errors .value    { color: var(--gray); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }

  .card.unchanged { border-left: 3px solid var(--green); }
  .card.changed   { border-left: 3px solid var(--red); }
  .card.unchecked { border-left: 3px solid var(--gray); }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .card-title {
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.3;
    word-break: break-word;
  }

  .badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    white-space: nowrap;
  }

  .badge.unchanged { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
  .badge.changed   { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-border); }
  .badge.unchecked { background: var(--gray-bg);  color: var(--gray);  border: 1px solid var(--gray-border); }

  .card-url {
    font-size: 0.8rem;
    color: var(--accent);
    word-break: break-all;
    text-decoration: none;
    display: block;
    margin-bottom: 0.9rem;
  }

  .card-url:hover { text-decoration: underline; }

  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .meta-row span:last-child { color: var(--text); text-align: right; }

  .loading, .error-msg {
    text-align: center;
    padding: 4rem;
    color: var(--muted);
    font-size: 1rem;
  }

  .error-msg { color: var(--red); }

  .refresh-bar {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .refresh-bar button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 1.2rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.15s;
  }

  .refresh-bar button:hover { background: var(--border); }

  footer {
    text-align: center;
    margin-top: 3rem;
    color: var(--muted);
    font-size: 0.78rem;
  }
</style>
</head>
<body>
<header>
  <h1>📑 Bookmark Change Tracker</h1>
  <p>Know when the websites you care about change.</p>
</header>

<div class="stats" id="stats">
  <div class="stat-card total">
    <div class="value" id="stat-total">—</div>
    <div class="label">Monitored</div>
  </div>
  <div class="stat-card unchanged">
    <div class="value" id="stat-unchanged">—</div>
    <div class="label">Unchanged</div>
  </div>
  <div class="stat-card changed">
    <div class="value" id="stat-changed">—</div>
    <div class="label">Changed</div>
  </div>
  <div class="stat-card errors">
    <div class="value" id="stat-unchecked">—</div>
    <div class="label">Not Checked</div>
  </div>
</div>

<div class="refresh-bar">
  <button onclick="loadData()">↻ Refresh</button>
</div>

<div class="grid" id="grid">
  <div class="loading">Loading bookmarks…</div>
</div>

<footer>
  Bookmark Change Tracker &nbsp;·&nbsp; Built on AWS Lambda + DynamoDB
</footer>

<script>
  function fmt(iso) {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium", timeStyle: "short"
      });
    } catch { return iso; }
  }

  function cardClass(b) {
    if (!b.lastChecked) return "unchecked";
    return b.changed ? "changed" : "unchanged";
  }

  function badgeLabel(b) {
    if (!b.lastChecked) return ["unchecked", "Not checked"];
    return b.changed ? ["changed", "Changed"] : ["unchanged", "Unchanged"];
  }

  function renderCard(b) {
    const cls = cardClass(b);
    const [badgeCls, badgeTxt] = badgeLabel(b);
    return \`<div class="card \${cls}">
      <div class="card-header">
        <span class="card-title">\${esc(b.title || "Untitled")}</span>
        <span class="badge \${badgeCls}">\${badgeTxt}</span>
      </div>
      <a class="card-url" href="\${esc(b.url)}" target="_blank" rel="noopener noreferrer">\${esc(b.url)}</a>
      <div class="card-meta">
        <div class="meta-row"><span>Last checked</span><span>\${fmt(b.lastChecked)}</span></div>
        \${b.lastChangedAt ? \`<div class="meta-row"><span>Last changed</span><span>\${fmt(b.lastChangedAt)}</span></div>\` : ""}
        <div class="meta-row"><span>Status</span><span>\${esc(b.status || "ACTIVE")}</span></div>
      </div>
    </div>\`;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  async function loadData() {
    const grid = document.getElementById("grid");
    grid.innerHTML = '<div class="loading">Loading…</div>';

    try {
      const res = await fetch("/api/bookmarks");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const { bookmarks } = await res.json();

      const total     = bookmarks.length;
      const changed   = bookmarks.filter(b => b.changed).length;
      const unchanged = bookmarks.filter(b => b.lastChecked && !b.changed).length;
      const unchecked = bookmarks.filter(b => !b.lastChecked).length;

      document.getElementById("stat-total").textContent     = total;
      document.getElementById("stat-unchanged").textContent = unchanged;
      document.getElementById("stat-changed").textContent   = changed;
      document.getElementById("stat-unchecked").textContent = unchecked;

      if (bookmarks.length === 0) {
        grid.innerHTML = '<div class="loading">No bookmarks found.</div>';
        return;
      }

      // Sort: changed first, then unchanged, then unchecked
      bookmarks.sort((a, b) => {
        const order = v => v.changed ? 0 : v.lastChecked ? 1 : 2;
        return order(a) - order(b);
      });

      grid.innerHTML = bookmarks.map(renderCard).join("");
    } catch (err) {
      grid.innerHTML = \`<div class="error-msg">Failed to load data: \${esc(err.message)}</div>\`;
    }
  }

  loadData();
</script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
    body: html,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(event) {
  const method = (event.requestContext?.http?.method ?? event.httpMethod ?? "GET").toUpperCase();
  const path   = event.requestContext?.http?.path ?? event.path ?? "/";

  // OPTIONS preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  // GET /api/bookmarks
  if (path === "/api/bookmarks") {
    try {
      const bookmarks = await fetchBookmarks();
      return apiResponse(bookmarks);
    } catch (err) {
      console.error("DynamoDB error:", err);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch bookmarks" }),
      };
    }
  }

  // GET / — dashboard
  return htmlResponse();
}
