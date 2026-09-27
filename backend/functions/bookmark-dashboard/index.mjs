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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bookmark Change Tracker</title>
<style>
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Tokens ── */
:root {
  --bg:           #080b12;
  --bg2:          #0d1117;
  --surface:      #161b24;
  --surface2:     #1c2333;
  --border:       #21283a;
  --border2:      #2d3748;
  --text:         #e6edf3;
  --text2:        #c9d1d9;
  --muted:        #7d8590;
  --accent:       #7c8ef7;
  --accent2:      #a5b0ff;
  --green:        #3fb950;
  --green-dim:    #238636;
  --green-bg:     #0d1f12;
  --green-border: #1a4228;
  --orange:       #f0883e;
  --orange-dim:   #bd561d;
  --orange-bg:    #1f1308;
  --orange-border:#6b3015;
  --gray:         #6e7681;
  --gray-bg:      #0d1117;
  --gray-border:  #21283a;
  --radius:       10px;
  --radius-lg:    16px;
  --shadow:       0 1px 3px rgba(0,0,0,.5), 0 4px 16px rgba(0,0,0,.3);
}

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

/* ── Layout shell ── */
.page-wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.25rem;
}

/* ── Top nav bar ── */
.topbar {
  border-bottom: 1px solid var(--border);
  background: rgba(13,17,23,.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 0.75rem 0;
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
  gap: 0.55rem;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
  letter-spacing: -0.01em;
}

.logo-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #5a67d8 0%, #7c8ef7 100%);
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.topbar-refresh {
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
.topbar-refresh:hover { background: var(--border2); border-color: var(--muted); }
.spin { display: inline-block; }
.loading-active .spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Hero ── */
.hero {
  text-align: center;
  padding: 3.5rem 1rem 2.5rem;
  border-bottom: 1px solid var(--border);
  background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,142,247,.12) 0%, transparent 70%);
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(124,142,247,.12);
  border: 1px solid rgba(124,142,247,.25);
  color: var(--accent2);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  margin-bottom: 1.25rem;
}

.hero h1 {
  font-size: clamp(1.75rem, 5vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.15;
  margin-bottom: 0.85rem;
  background: linear-gradient(160deg, #e6edf3 25%, var(--accent2) 75%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero p {
  color: var(--muted);
  font-size: 1.05rem;
  max-width: 480px;
  margin: 0 auto;
}

/* ── Stats strip ── */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin: 2rem 0;
  background: var(--surface);
}

.stat-cell {
  padding: 1.2rem 1rem;
  text-align: center;
  border-right: 1px solid var(--border);
  position: relative;
}
.stat-cell:last-child { border-right: none; }

.stat-value {
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
}
.stat-label {
  font-size: 0.72rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-top: 0.3rem;
}

.stat-cell.s-total   .stat-value { color: var(--accent2); }
.stat-cell.s-ok      .stat-value { color: var(--green); }
.stat-cell.s-changed .stat-value { color: var(--orange); }
.stat-cell.s-pending .stat-value { color: var(--gray); }

@media (max-width: 480px) {
  .stats-strip { grid-template-columns: repeat(2, 1fr); }
  .stat-cell:nth-child(2) { border-right: none; }
  .stat-cell:nth-child(1),
  .stat-cell:nth-child(2) { border-bottom: 1px solid var(--border); }
}

/* ── Section headings ── */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
}

.section-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.section-count {
  font-size: 0.75rem;
  color: var(--muted);
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
}

/* ── Bookmark cards grid ── */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.bm-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.15rem 1.2rem;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bm-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border2);
}

.bm-card.st-ok      { border-top: 2px solid var(--green-dim); }
.bm-card.st-changed { border-top: 2px solid var(--orange-dim); }
.bm-card.st-pending { border-top: 2px solid var(--gray); }

/* card top row */
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.card-favicon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.card-title-wrap { flex: 1; min-width: 0; }

.card-name {
  font-weight: 600;
  font-size: 0.92rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-url-text {
  font-size: 0.73rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  margin-top: 0.1rem;
}

/* status pill */
.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  white-space: nowrap;
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pill.p-ok {
  background: var(--green-bg);
  color: var(--green);
  border: 1px solid var(--green-border);
}
.pill.p-ok .pill-dot { background: var(--green); }

.pill.p-changed {
  background: var(--orange-bg);
  color: var(--orange);
  border: 1px solid var(--orange-border);
}
.pill.p-changed .pill-dot { background: var(--orange); }

.pill.p-pending {
  background: var(--gray-bg);
  color: var(--gray);
  border: 1px solid var(--gray-border);
}
.pill.p-pending .pill-dot { background: var(--gray); }

/* status message */
.card-status-msg {
  font-size: 0.78rem;
  padding: 0.45rem 0.7rem;
  border-radius: 7px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.card-status-msg.msg-ok {
  background: var(--green-bg);
  color: var(--green);
  border: 1px solid var(--green-border);
}

.card-status-msg.msg-changed {
  background: var(--orange-bg);
  color: var(--orange);
  border: 1px solid var(--orange-border);
}

.card-status-msg.msg-pending {
  background: var(--gray-bg);
  color: var(--gray);
  border: 1px solid var(--gray-border);
}

/* card meta rows */
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-top: 1px solid var(--border);
  padding-top: 0.7rem;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.74rem;
  gap: 0.5rem;
}

.meta-key { color: var(--muted); white-space: nowrap; }
.meta-val { color: var(--text2); text-align: right; word-break: break-all; }

/* ── Empty / loading / error states ── */
.state-box {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3.5rem 1rem;
  color: var(--muted);
}

.state-box .state-icon { font-size: 2rem; margin-bottom: 0.75rem; }
.state-box .state-title { font-weight: 600; font-size: 1rem; color: var(--text2); margin-bottom: 0.3rem; }
.state-box .state-sub { font-size: 0.82rem; }
.state-box.err .state-title { color: var(--orange); }

/* ── How it works ── */
.how-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 1.75rem 2rem;
  margin-bottom: 3rem;
}

.how-section h2 {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 1.25rem;
}

.steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
}

.step {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
}

.step-num {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(124,142,247,.14);
  border: 1px solid rgba(124,142,247,.25);
  color: var(--accent2);
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-body { flex: 1; }
.step-title { font-weight: 600; font-size: 0.85rem; color: var(--text); margin-bottom: 0.2rem; }
.step-desc  { font-size: 0.77rem; color: var(--muted); line-height: 1.5; }

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

.footer-aws {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted);
  font-weight: 500;
}

.aws-icon {
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

<!-- ── Top nav bar ── -->
<nav class="topbar" aria-label="Site navigation">
  <div class="page-wrap">
    <div class="topbar-inner">
      <div class="topbar-logo">
        <div class="logo-icon" aria-hidden="true">&#128278;</div>
        Bookmark Change Tracker
      </div>
      <button class="topbar-refresh" id="refresh-btn" onclick="loadData()" aria-label="Refresh data">
        <span class="spin" aria-hidden="true">&#8635;</span> Refresh
      </button>
    </div>
  </div>
</nav>

<!-- ── Hero ── -->
<div class="hero" role="banner">
  <div class="page-wrap">
    <div class="hero-badge" aria-hidden="true">&#9679; Live Monitoring</div>
    <h1>Bookmark Change Tracker</h1>
    <p>Know when the websites you care about change.</p>
  </div>
</div>

<main class="page-wrap">

  <!-- ── Stats ── -->
  <div class="stats-strip" role="region" aria-label="Summary statistics">
    <div class="stat-cell s-total">
      <div class="stat-value" id="stat-total" aria-label="Total monitored">&#8212;</div>
      <div class="stat-label">Monitored</div>
    </div>
    <div class="stat-cell s-ok">
      <div class="stat-value" id="stat-ok" aria-label="Unchanged">&#8212;</div>
      <div class="stat-label">Unchanged</div>
    </div>
    <div class="stat-cell s-changed">
      <div class="stat-value" id="stat-changed" aria-label="Changed">&#8212;</div>
      <div class="stat-label">Changed</div>
    </div>
    <div class="stat-cell s-pending">
      <div class="stat-value" id="stat-pending" aria-label="Pending first check">&#8212;</div>
      <div class="stat-label">Not Yet Checked</div>
    </div>
  </div>

  <!-- ── Bookmarks ── -->
  <section aria-label="Your websites">
    <div class="section-head">
      <span class="section-title">Your Websites</span>
      <span class="section-count" id="section-count" aria-live="polite"></span>
    </div>
    <div class="cards-grid" id="grid" aria-live="polite" aria-label="Bookmark cards">
      <div class="state-box">
        <div class="state-icon" aria-hidden="true">&#8635;</div>
        <div class="state-title">Loading your bookmarks&hellip;</div>
        <div class="state-sub">Fetching from DynamoDB</div>
      </div>
    </div>
  </section>

  <!-- ── How it works ── -->
  <div class="how-section" role="region" aria-label="How it works">
    <h2>How it works</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num" aria-hidden="true">1</div>
        <div class="step-body">
          <div class="step-title">Bookmark a website</div>
          <div class="step-desc">Add any website to Chrome. Our extension detects it automatically and registers it for monitoring.</div>
        </div>
      </div>
      <div class="step">
        <div class="step-num" aria-hidden="true">2</div>
        <div class="step-body">
          <div class="step-title">We check it automatically</div>
          <div class="step-desc">A Lambda function runs daily, fetches each page, and compares a content hash against the previous value.</div>
        </div>
      </div>
      <div class="step">
        <div class="step-num" aria-hidden="true">3</div>
        <div class="step-body">
          <div class="step-title">See what changed</div>
          <div class="step-desc">Open this dashboard to see which of your bookmarked websites have updated their content.</div>
        </div>
      </div>
    </div>
  </div>

</main>

<!-- ── Footer ── -->
<footer>
  <span>Bookmark Change Tracker</span>
  <span aria-hidden="true">&middot;</span>
  <span class="footer-aws">
    Powered by <span class="aws-icon" aria-label="AWS">AWS</span>
    Lambda &middot; DynamoDB &middot; API Gateway
  </span>
</footer>

<script>
(function () {
  "use strict";

  /* ── HTML escaping ── */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ── URL display helper: strip scheme for readability ── */
  function displayUrl(u) {
    try { return new URL(u).host; } catch { return u; }
  }

  /* ── Date formatting ── */
  function fmt(iso) {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch { return String(iso); }
  }

  /* ── Derive card state ── */
  function state(b) {
    if (!b.lastChecked) return "pending";
    return b.changed ? "changed" : "ok";
  }

  /* ── Status message copy ── */
  function statusMsg(b) {
    const s = state(b);
    if (s === "ok")      return { cls: "msg-ok",      icon: "&#10003;", text: "No changes detected" };
    if (s === "changed") return { cls: "msg-changed",  icon: "&#9888;&#xFE0F;", text: "Website content changed" };
    return                      { cls: "msg-pending",  icon: "&#9711;", text: "Awaiting first check" };
  }

  /* ── Pill copy ── */
  function pillInfo(b) {
    const s = state(b);
    if (s === "ok")      return { cls: "p-ok",      label: "Unchanged" };
    if (s === "changed") return { cls: "p-changed",  label: "Changed" };
    return                      { cls: "p-pending",  label: "Not checked" };
  }

  /* ── Favicon letter avatar ── */
  function faviconLetter(title) {
    const ch = (title || "?")[0].toUpperCase();
    return esc(ch);
  }

  /* ── Render one card ── */
  function renderCard(b) {
    const s   = state(b);
    const msg = statusMsg(b);
    const pil = pillInfo(b);

    return '<article class="bm-card st-' + s + '" aria-label="' + esc(b.title || "Bookmark") + '">'
      + '<div class="card-top">'
      +   '<div class="card-favicon" aria-hidden="true">' + faviconLetter(b.title) + '</div>'
      +   '<div class="card-title-wrap">'
      +     '<div class="card-name" title="' + esc(b.title || "Untitled") + '">' + esc(b.title || "Untitled") + '</div>'
      +     '<a class="card-url-text" href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(b.url) + '">'
      +       esc(displayUrl(b.url))
      +     '</a>'
      +   '</div>'
      +   '<span class="pill ' + pil.cls + '" role="status">'
      +     '<span class="pill-dot" aria-hidden="true"></span>' + pil.label
      +   '</span>'
      + '</div>'
      + '<div class="card-status-msg ' + msg.cls + '" role="status">'
      +   '<span aria-hidden="true">' + msg.icon + '</span> ' + msg.text
      + '</div>'
      + '<dl class="card-meta">'
      +   '<div class="meta-row"><dt class="meta-key">Last checked</dt><dd class="meta-val">' + esc(fmt(b.lastChecked)) + '</dd></div>'
      +   (b.lastChangedAt
          ? '<div class="meta-row"><dt class="meta-key">Last changed</dt><dd class="meta-val">' + esc(fmt(b.lastChangedAt)) + '</dd></div>'
          : '')
      + '</dl>'
      + '</article>';
  }

  /* ── Main data loader ── */
  async function loadData() {
    const grid    = document.getElementById("grid");
    const btn     = document.getElementById("refresh-btn");
    const counter = document.getElementById("section-count");

    btn.classList.add("loading-active");
    btn.disabled = true;
    grid.innerHTML =
      '<div class="state-box"><div class="state-icon" aria-hidden="true">&#8635;</div>'
      + '<div class="state-title">Loading your bookmarks&hellip;</div>'
      + '<div class="state-sub">Fetching from DynamoDB</div></div>';

    try {
      const res = await fetch("/api/bookmarks");
      if (!res.ok) throw new Error("Server returned HTTP " + res.status);
      const { bookmarks } = await res.json();

      /* ── Update stats ── */
      const total   = bookmarks.length;
      const changed = bookmarks.filter(function(b){ return b.changed; }).length;
      const ok      = bookmarks.filter(function(b){ return b.lastChecked && !b.changed; }).length;
      const pending = bookmarks.filter(function(b){ return !b.lastChecked; }).length;

      document.getElementById("stat-total").textContent   = total;
      document.getElementById("stat-ok").textContent      = ok;
      document.getElementById("stat-changed").textContent = changed;
      document.getElementById("stat-pending").textContent = pending;
      counter.textContent = total + " site" + (total !== 1 ? "s" : "");

      /* ── Empty state ── */
      if (total === 0) {
        grid.innerHTML =
          '<div class="state-box">'
          + '<div class="state-icon" aria-hidden="true">&#128278;</div>'
          + '<div class="state-title">No bookmarks yet</div>'
          + '<div class="state-sub">Install the Chrome extension and bookmark some websites to get started.</div>'
          + '</div>';
        return;
      }

      /* ── Sort: changed → ok → pending ── */
      bookmarks.sort(function(a, b) {
        var order = function(v) { return v.changed ? 0 : v.lastChecked ? 1 : 2; };
        return order(a) - order(b);
      });

      grid.innerHTML = bookmarks.map(renderCard).join("");
    } catch (err) {
      grid.innerHTML =
        '<div class="state-box err">'
        + '<div class="state-icon" aria-hidden="true">&#9888;&#xFE0F;</div>'
        + '<div class="state-title">Failed to load bookmarks</div>'
        + '<div class="state-sub">' + esc(err.message) + '</div>'
        + '</div>';
      document.getElementById("stat-total").textContent   = "—";
      document.getElementById("stat-ok").textContent      = "—";
      document.getElementById("stat-changed").textContent = "—";
      document.getElementById("stat-pending").textContent = "—";
    } finally {
      btn.classList.remove("loading-active");
      btn.disabled = false;
    }
  }

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
