"use strict";

// Same endpoint used by background.js
const API_URL =
  "https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/bookmarks";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const syncBtn    = document.getElementById("sync-btn");
const statusEl   = document.getElementById("status");
const bookmarksSec = document.getElementById("bookmarks-section");

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely escape text for insertion as HTML.
 * Uses a temporary DOM element — Chrome extension context, so this is safe.
 */
function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text == null ? "" : text);
  return div.innerHTML;
}

/** Display a short hostname for the URL column. */
function displayHost(url) {
  try { return new URL(url).host; } catch { return url; }
}

/** Recursively collect every node that has a url (i.e. is not a folder). */
function extractBookmarks(nodes) {
  const results = [];
  function walk(nodeList) {
    for (const node of nodeList) {
      if (node.url) {
        results.push({ id: node.id, title: node.title || "Untitled", url: node.url });
      }
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return results;
}

/** Update the status bar with the appropriate style. */
function setStatus(msg, type /* idle | syncing | success | partial | error */) {
  statusEl.textContent = msg;
  statusEl.className = "status status-" + (type || "idle");
}

/** POST a single bookmark to the API. Returns true on success. */
async function registerBookmark(bookmark) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookmarkId: bookmark.id,
      title:      bookmark.title,
      url:        bookmark.url,
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return true;
}

// ── Render bookmark list after sync ──────────────────────────────────────────
function renderResults(bookmarks, outcomes) {
  if (bookmarks.length === 0) {
    bookmarksSec.innerHTML = "";
    return;
  }

  const rows = bookmarks.map(function (b, i) {
    const outcome = outcomes[i];
    const ok = outcome.status === "fulfilled";
    const indCls  = ok ? "ok" : "failed";
    const resCls  = ok ? "ok" : "failed";
    const resTxt  = ok ? "✓ Synced" : "✗ Failed";

    return '<div class="bookmark">'
      + '<div class="bookmark-indicator ' + indCls + '" aria-hidden="true"></div>'
      + '<div class="bookmark-body">'
      +   '<div class="bookmark-title" title="' + esc(b.title) + '">' + esc(b.title) + '</div>'
      +   '<div class="bookmark-url" title="' + esc(b.url) + '">' + esc(displayHost(b.url)) + '</div>'
      + '</div>'
      + '<div class="bookmark-result ' + resCls + '" aria-label="' + resTxt + '">' + resTxt + '</div>'
      + '</div>';
  }).join("");

  bookmarksSec.innerHTML =
    '<div class="section-label">Bookmarks (' + bookmarks.length + ')</div>' + rows;
}

// ── Sync handler ─────────────────────────────────────────────────────────────
async function handleSync() {
  // Disable button and show spinner
  syncBtn.disabled = true;
  syncBtn.classList.add("syncing");
  bookmarksSec.innerHTML = "";
  setStatus("Syncing your bookmarks\u2026", "syncing");

  try {
    // 1. Discover all bookmarks
    const tree = await new Promise(function (resolve, reject) {
      chrome.bookmarks.getTree(function (result) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    const bookmarks = extractBookmarks(tree);

    if (bookmarks.length === 0) {
      setStatus("No website bookmarks found.", "idle");
      syncBtn.disabled = false;
      syncBtn.classList.remove("syncing");
      return;
    }

    // 2. Register all bookmarks concurrently; allSettled never throws
    const outcomes = await Promise.allSettled(
      bookmarks.map(function (b) { return registerBookmark(b); })
    );

    // 3. Count results
    const succeeded = outcomes.filter(function (o) { return o.status === "fulfilled"; }).length;
    const failed    = outcomes.length - succeeded;
    const total     = outcomes.length;

    // 4. Set status message
    if (failed === 0) {
      setStatus("\u2713 Synced " + total + " bookmark" + (total !== 1 ? "s" : ""), "success");
    } else if (succeeded === 0) {
      setStatus("Sync failed. " + failed + " bookmark" + (failed !== 1 ? "s" : "") + " could not be registered.", "error");
    } else {
      setStatus(
        "Synced " + succeeded + " of " + total + " bookmarks. " + failed + " failed.",
        "partial"
      );
    }

    // 5. Render per-bookmark results
    renderResults(bookmarks, outcomes);

  } catch (err) {
    setStatus("Error: " + err.message, "error");
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove("syncing");
  }
}

// ── Wire up ──────────────────────────────────────────────────────────────────
syncBtn.addEventListener("click", handleSync);
