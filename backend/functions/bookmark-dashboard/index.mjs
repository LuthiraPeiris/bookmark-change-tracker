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

  // Keep only the fields the MVP needs — drop all change-detection internals
  return items.map(function (item) {
    return {
      bookmarkId: item.bookmarkId,
      title: item.title,
      url: item.url,
      category: item.category || "Other",
      createdAt: item.createdAt,
    };
  });
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
// HTML Dashboard  GET /  — Bookmark Library
// ---------------------------------------------------------------------------

function htmlResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bookmark Library</title>
<style>
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Design tokens ── */
:root {
  --bg:        #080b12;
  --bg2:       #0d1117;
  --surface:   #161b24;
  --surface2:  #1c2333;
  --border:    #21283a;
  --border2:   #2d3748;
  --text:      #e6edf3;
  --text2:     #c9d1d9;
  --muted:     #7d8590;
  --accent:    #7c8ef7;
  --accent2:   #a5b0ff;
  --radius:    10px;
  --radius-lg: 16px;
  --shadow:    0 1px 3px rgba(0,0,0,.5), 0 4px 16px rgba(0,0,0,.3);
}

/* ── Category pill colours ── */
.cat-Development { --cat-c: #79c0ff; --cat-bg: #051d2e; --cat-b: #0d3958; }
.cat-AWS-Cloud   { --cat-c: #f0883e; --cat-bg: #1f1308; --cat-b: #6b3015; }
.cat-Learning    { --cat-c: #56d364; --cat-bg: #0d1f12; --cat-b: #1a4228; }
.cat-Articles    { --cat-c: #d2a8ff; --cat-bg: #1a0c2a; --cat-b: #3b1f5e; }
.cat-Tools       { --cat-c: #ffa657; --cat-bg: #1f1200; --cat-b: #6a3a00; }
.cat-Social      { --cat-c: #58a6ff; --cat-bg: #051830; --cat-b: #0c3564; }
.cat-Other       { --cat-c: #7d8590; --cat-bg: #0d1117; --cat-b: #21283a; }

/* ── Base ── */
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--accent2); }

/* ── Page wrap ── */
.page-wrap {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 1.25rem;
}

/* ── Topbar ── */
.topbar {
  border-bottom: 1px solid var(--border);
  background: rgba(13,17,23,.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 0.7rem 0;
}

.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.topbar-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
  letter-spacing: -0.01em;
}

.logo-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #5a67d8, #7c8ef7);
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn-sm {
  background: var(--surface2);
  border: 1px solid var(--border2);
  color: var(--text2);
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.8rem;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  transition: background 0.15s, border-color 0.15s;
}

.btn-sm:hover {
  background: var(--border2);
  border-color: var(--muted);
}

.spin {
  display: inline-block;
}

.loading-active .spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Hero ── */
.hero {
  text-align: center;
  padding: 3rem 1rem 2rem;
  border-bottom: 1px solid var(--border);
  background: radial-gradient(
    ellipse 80% 50% at 50% -10%,
    rgba(124,142,247,.1) 0%,
    transparent 70%
  );
}

.hero h1 {
  font-size: clamp(1.75rem, 5vw, 2.6rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.15;
  margin-bottom: 0.7rem;
  background: linear-gradient(160deg, #e6edf3 25%, var(--accent2) 75%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero p {
  color: var(--muted);
  font-size: 1rem;
  max-width: 460px;
  margin: 0 auto;
}

/* ── Stats bar ── */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 0;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.stat-num {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--accent2);
  line-height: 1;
}

.stat-lbl {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

/* ── Controls row ── */
.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 1.25rem;
  flex-wrap: wrap;
}

.search-wrap {
  flex: 1;
  min-width: 200px;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 0.85rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.55rem 0.75rem 0.55rem 2.2rem;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.875rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input::placeholder {
  color: var(--muted);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(124,142,247,.15);
}

/* ── Category filter chips ── */
.filter-chips {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  padding-bottom: 1rem;
}

.chip {
  padding: 0.28rem 0.75rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--border2);
  color: var(--muted);
  transition: all 0.15s;
  white-space: nowrap;
  font-family: inherit;
}

.chip:hover {
  border-color: var(--accent);
  color: var(--accent2);
}

.chip.active {
  background: rgba(124,142,247,.18);
  border-color: rgba(124,142,247,.4);
  color: var(--accent2);
}

/* ── Results info ── */
.results-info {
  font-size: 0.75rem;
  color: var(--muted);
  padding-bottom: 0.75rem;
}

/* ── Cards grid ── */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.85rem;
  margin-bottom: 3rem;
}

.bm-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.1rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.bm-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border2);
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.card-letter {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--accent2);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-weight: 600;
  font-size: 0.88rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.card-domain {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 0.1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* category pill on card */
.cat-pill {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--cat-b);
  background: var(--cat-bg);
  color: var(--cat-c);
  white-space: nowrap;
}

/* open link */
.card-link {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  padding: 0.4rem 0;
  border-top: 1px solid var(--border);
  margin-top: 0.1rem;
  transition: color 0.15s;
}

.card-link:hover {
  color: var(--accent2);
  text-decoration: none;
}

/* ── Empty / loading / error ── */
.state-box {
  grid-column: 1 / -1;
  text-align: center;
  padding: 4rem 1rem;
  color: var(--muted);
}

.state-box .s-icon {
  font-size: 2.2rem;
  margin-bottom: 0.75rem;
}

.state-box .s-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text2);
  margin-bottom: 0.3rem;
}

.state-box .s-sub {
  font-size: 0.82rem;
}

.state-box.s-err .s-title {
  color: #f0883e;
}

/* ── Footer ── */
footer {
  border-top: 1px solid var(--border);
  padding: 1.25rem 0 2rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.aws-badge {
  display: inline-block;
  background: #ff9900;
  color: #000;
  font-size: 0.55rem;
  font-weight: 900;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  letter-spacing: 0.02em;
  line-height: 1.4;
}
</style>
</head>

<body>

<!-- Topbar -->
<nav class="topbar" aria-label="Site navigation">
  <div class="page-wrap">
    <div class="topbar-inner">
      <div class="topbar-logo">
        <div class="logo-icon" aria-hidden="true">&#128278;</div>
        Bookmark Library
      </div>

      <div class="topbar-right">
        <button class="btn-sm" id="refresh-btn" aria-label="Refresh">
          <span class="spin" aria-hidden="true">&#8635;</span>
          Refresh
        </button>
      </div>
    </div>
  </div>
</nav>

<!-- Hero -->
<div class="hero">
  <div class="page-wrap">
    <h1>&#128278; Bookmark Library</h1>
    <p>Your saved websites, organised and searchable.</p>
  </div>
</div>

<main class="page-wrap">

  <!-- Stats -->
  <div class="stats-bar" id="stats-bar">
    <div class="stat-item">
      <span class="stat-num" id="stat-total">&#8212;</span>
      <span class="stat-lbl">Bookmarks</span>
    </div>

    <div class="stat-item">
      <span class="stat-num" id="stat-cats" style="font-size:1.1rem">&#8212;</span>
      <span class="stat-lbl">Categories</span>
    </div>
  </div>

  <!-- Search -->
  <div class="controls">
    <div class="search-wrap">
      <span class="search-icon" aria-hidden="true">&#128269;</span>

      <input
        type="search"
        id="search"
        class="search-input"
        placeholder="Search title, URL or category&hellip;"
        aria-label="Search bookmarks"
        autocomplete="off"
      />
    </div>
  </div>

  <!-- Category chips -->
  <div
    class="filter-chips"
    id="filter-chips"
    role="group"
    aria-label="Category filters"
  >
    <button class="chip active" data-cat="All">All</button>
  </div>

  <!-- Results count -->
  <div class="results-info" id="results-info" aria-live="polite"></div>

  <!-- Cards -->
  <div
    class="cards-grid"
    id="grid"
    aria-live="polite"
    aria-label="Bookmark cards"
  >
    <div class="state-box">
      <div class="s-icon" aria-hidden="true">&#8635;</div>
      <div class="s-title">Loading your bookmarks&hellip;</div>
      <div class="s-sub">Fetching from DynamoDB</div>
    </div>
  </div>

</main>

<footer>
  <span>Bookmark Library</span>
  <span aria-hidden="true">&middot;</span>
  <span>
    Powered by
    <span class="aws-badge" aria-label="AWS">AWS</span>
    Lambda &middot; DynamoDB &middot; API Gateway
  </span>
</footer>

<script>
(function () {
  "use strict";

  var allBookmarks = [];
  var activeCategory = "All";

  /* ── Escape ── */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ── Hostname ── */
  function host(url) {
    try {
      return new URL(url).hostname.replace(/^www\\./, "");
    } catch {
      return url;
    }
  }

  /* ── CSS-safe category class ── */
  function catClass(cat) {
    return "cat-" + (cat || "Other").replace(/[^a-zA-Z0-9]+/g, "-");
  }

  /* ── Render one card ── */
  function renderCard(b) {
    var letter = esc((b.title || "?")[0].toUpperCase());
    var cat = b.category || "Other";
    var cls = catClass(cat);

    return '<article class="bm-card" aria-label="' + esc(b.title || "Bookmark") + '">'
      + '<div class="card-top">'
      +   '<div class="card-letter ' + cls + '">' + letter + '</div>'
      +   '<div class="card-info">'
      +     '<div class="card-name" title="' + esc(b.title) + '">' + esc(b.title || "Untitled") + '</div>'
      +     '<div class="card-domain">' + esc(host(b.url)) + '</div>'
      +   '</div>'
      +   '<span class="cat-pill ' + cls + '">' + esc(cat) + '</span>'
      + '</div>'
      + '<a class="card-link" href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">'
      +   '&#128279; Open website'
      + '</a>'
      + '</article>';
  }

  /* ── Filter + render ── */
  function renderVisible() {
    var query = document.getElementById("search").value.toLowerCase().trim();
    var grid = document.getElementById("grid");
    var info = document.getElementById("results-info");

    var visible = allBookmarks.filter(function (b) {
      var catMatch =
        activeCategory === "All" ||
        b.category === activeCategory;

      if (!catMatch) return false;
      if (!query) return true;

      return (b.title || "").toLowerCase().indexOf(query) >= 0
        || (b.url || "").toLowerCase().indexOf(query) >= 0
        || (b.category || "").toLowerCase().indexOf(query) >= 0
        || host(b.url).toLowerCase().indexOf(query) >= 0;
    });

    if (visible.length === 0) {
      var msg =
        query || activeCategory !== "All"
          ? "No bookmarks match your search."
          : "No bookmarks yet.";

      grid.innerHTML =
        '<div class="state-box">'
        + '<div class="s-icon" aria-hidden="true">&#128278;</div>'
        + '<div class="s-title">' + esc(msg) + '</div>'
        + '<div class="s-sub">Try a different search or category filter.</div>'
        + '</div>';

      info.textContent = "";
      return;
    }

    // Sort newest bookmarks first
visible.sort(function (a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
});

    grid.innerHTML = visible.map(renderCard).join("");

    info.textContent =
      visible.length
      + " of "
      + allBookmarks.length
      + " bookmark"
      + (allBookmarks.length !== 1 ? "s" : "");
  }

  /* ── Build category chips ── */
  function buildChips(bookmarks) {
    var counts = {};

    bookmarks.forEach(function (b) {
      var c = b.category || "Other";
      counts[c] = (counts[c] || 0) + 1;
    });

    var cats = Object.keys(counts).sort();
    var container = document.getElementById("filter-chips");

    // Clear all except "All" button (first child)
    while (container.children.length > 1) {
      container.removeChild(container.lastChild);
    }

    cats.forEach(function (cat) {
      var btn = document.createElement("button");

      btn.className = "chip";
      btn.dataset.cat = cat;
      btn.textContent = cat + " (" + counts[cat] + ")";

      btn.addEventListener("click", function () {
        setCategory(cat);
      });

      container.appendChild(btn);
    });

    // Update "All" chip count
    container.children[0].textContent =
      "All (" + bookmarks.length + ")";
  }

  /* ── Set active category ── */
  function setCategory(cat) {
    activeCategory = cat;

    var chips = document.querySelectorAll(".chip");

    chips.forEach(function (c) {
      c.classList.toggle("active", c.dataset.cat === cat);
    });

    renderVisible();
  }

  /* ── Load data ── */
  async function loadData() {
    var btn = document.getElementById("refresh-btn");
    var grid = document.getElementById("grid");

    btn.classList.add("loading-active");
    btn.disabled = true;

    grid.innerHTML =
      '<div class="state-box">'
      + '<div class="s-icon" aria-hidden="true">&#8635;</div>'
      + '<div class="s-title">Loading your bookmarks&hellip;</div>'
      + '<div class="s-sub">Fetching from DynamoDB</div>'
      + '</div>';

    try {
      var res = await fetch("/api/bookmarks");

      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }

      var data = await res.json();

      allBookmarks = data.bookmarks || [];

      /* Stats */
      var cats = new Set(
        allBookmarks.map(function (b) {
          return b.category || "Other";
        })
      );

      document.getElementById("stat-total").textContent =
        allBookmarks.length;

      document.getElementById("stat-cats").textContent =
        cats.size;

      buildChips(allBookmarks);
      renderVisible();

    } catch (err) {
      grid.innerHTML =
        '<div class="state-box s-err">'
        + '<div class="s-icon" aria-hidden="true">&#9888;&#xFE0F;</div>'
        + '<div class="s-title">Failed to load bookmarks</div>'
        + '<div class="s-sub">' + esc(err.message) + '</div>'
        + '</div>';

    } finally {
      btn.classList.remove("loading-active");
      btn.disabled = false;
    }
  }

  /* ── Wire up ── */
  document.getElementById("search")
    .addEventListener("input", renderVisible);

  document.getElementById("refresh-btn")
    .addEventListener("click", loadData);

  document.getElementById("filter-chips")
    .children[0]
    .addEventListener("click", function () {
      setCategory("All");
    });

  loadData();

}());
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
  const method =
    (event.requestContext?.http?.method ??
      event.httpMethod ??
      "GET").toUpperCase();

  const path =
    event.requestContext?.http?.path ??
    event.path ??
    "/";

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Failed to fetch bookmarks",
        }),
      };
    }
  }

  // GET / — dashboard
  return htmlResponse();
}