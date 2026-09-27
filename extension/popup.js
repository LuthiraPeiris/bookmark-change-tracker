"use strict";

// Same endpoint used by background.js
const API_URL =
  "https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/bookmarks";

// Maximum simultaneous API requests — stays well under the Lambda concurrency limit of 10
const MAX_CONCURRENCY = 3;

// URL schemes that cannot be monitored — skip without counting as failures
const SUPPORTED_SCHEMES = ["http://", "https://"];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const syncBtn      = document.getElementById("sync-btn");
const statusEl     = document.getElementById("status");
const bookmarksSec = document.getElementById("bookmarks-section");

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely escape text for insertion as HTML.
 * Uses a temporary DOM element — safe in extension context.
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

/** Returns true if the URL uses a supported (http/https) scheme. */
function isSupportedUrl(url) {
  for (var i = 0; i < SUPPORTED_SCHEMES.length; i++) {
    if (url.indexOf(SUPPORTED_SCHEMES[i]) === 0) return true;
  }
  return false;
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

/** POST a single bookmark to the API. Throws on non-2xx. */
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

// ── Concurrency-limited pool ──────────────────────────────────────────────────
/**
 * Process every item in `items` by calling `taskFn(item)`, with at most
 * `concurrency` tasks running simultaneously.  Calls `onProgress(done, total)`
 * after each task completes.  Returns an array of PromiseSettledResult objects
 * in the same order as `items`.
 */
async function pooledAllSettled(items, taskFn, concurrency, onProgress) {
  var total    = items.length;
  var results  = new Array(total);
  var index    = 0;   // next item to start
  var done     = 0;   // items finished

  // Each worker pulls the next available item until exhausted
  async function worker() {
    while (true) {
      var i = index++;
      if (i >= total) break;
      try {
        results[i] = { status: "fulfilled", value: await taskFn(items[i]) };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
      done++;
      onProgress(done, total);
    }
  }

  // Spawn exactly MIN(concurrency, total) workers
  var workerCount = Math.min(concurrency, total);
  var workers = [];
  for (var w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);   // wait until all workers have drained the queue

  return results;
}

// ── Render bookmark list after sync ──────────────────────────────────────────
/**
 * Render the per-bookmark result rows.
 * `allBookmarks`  — full list (eligible + skipped)
 * `eligible`      — bookmarks that were sent to the API
 * `outcomes`      — PromiseSettledResult[] aligned to `eligible`
 * `skippedCount`  — count of non-http(s) bookmarks
 */
function renderResults(eligible, outcomes, skippedCount) {
  if (eligible.length === 0 && skippedCount === 0) {
    bookmarksSec.innerHTML = "";
    return;
  }

  // Build result rows for eligible bookmarks
  var rows = eligible.map(function (b, i) {
    var outcome = outcomes[i];
    var ok      = outcome.status === "fulfilled";
    var indCls  = ok ? "ok" : "failed";
    var resTxt  = ok ? "\u2713 Synced" : "\u2717 Failed";
    var resCls  = ok ? "ok" : "failed";

    return '<div class="bookmark">'
      + '<div class="bookmark-indicator ' + indCls + '" aria-hidden="true"></div>'
      + '<div class="bookmark-body">'
      +   '<div class="bookmark-title" title="' + esc(b.title) + '">' + esc(b.title) + '</div>'
      +   '<div class="bookmark-url" title="' + esc(b.url) + '">' + esc(displayHost(b.url)) + '</div>'
      + '</div>'
      + '<div class="bookmark-result ' + resCls + '">' + resTxt + '</div>'
      + '</div>';
  }).join("");

  var label = eligible.length + " synced";
  if (skippedCount > 0) label += " &middot; " + skippedCount + " skipped";

  bookmarksSec.innerHTML =
    '<div class="section-label">Results (' + label + ')</div>' + rows;
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

    const allBookmarks = extractBookmarks(tree);

    if (allBookmarks.length === 0) {
      setStatus("No website bookmarks found.", "idle");
      return;
    }

    // 2. Partition into eligible (http/https) and skipped (everything else)
    const eligible = [];
    const skipped  = [];
    for (var i = 0; i < allBookmarks.length; i++) {
      if (isSupportedUrl(allBookmarks[i].url)) {
        eligible.push(allBookmarks[i]);
      } else {
        skipped.push(allBookmarks[i]);
      }
    }

    if (eligible.length === 0) {
      var skipMsg = "No http/https bookmarks found.";
      if (skipped.length > 0) {
        skipMsg += " " + skipped.length + " bookmark" + (skipped.length !== 1 ? "s" : "") + " skipped (unsupported URL scheme).";
      }
      setStatus(skipMsg, "idle");
      return;
    }

    // 3. Register eligible bookmarks with a concurrency limit of MAX_CONCURRENCY.
    //    pooledAllSettled processes at most 3 requests at a time, calling
    //    onProgress after each completion so the status bar stays live.
    const outcomes = await pooledAllSettled(
      eligible,
      registerBookmark,
      MAX_CONCURRENCY,
      function onProgress(done, total) {
        setStatus(
          "Syncing " + done + " of " + total + " bookmarks\u2026",
          "syncing"
        );
      }
    );

    // 4. Count results
    const succeeded   = outcomes.filter(function (o) { return o.status === "fulfilled"; }).length;
    const failed      = outcomes.length - succeeded;
    const skippedCount = skipped.length;

    // 5. Build final status message
    var parts = [];
    if (failed === 0) {
      parts.push("\u2713 Synced " + succeeded + " bookmark" + (succeeded !== 1 ? "s" : ""));
    } else if (succeeded === 0) {
      parts.push("Sync failed \u2014 " + failed + " bookmark" + (failed !== 1 ? "s" : "") + " could not be registered");
    } else {
      parts.push("Synced " + succeeded + " of " + (succeeded + failed) + " bookmarks \u00b7 " + failed + " failed");
    }
    if (skippedCount > 0) {
      parts.push(skippedCount + " skipped");
    }

    var statusMsg  = parts.join(" \u00b7 ");
    var statusType = failed === 0 ? "success" : (succeeded === 0 ? "error" : "partial");
    setStatus(statusMsg, statusType);

    // 6. Render per-bookmark result rows
    renderResults(eligible, outcomes, skippedCount);

  } catch (err) {
    setStatus("Error: " + esc(err.message), "error");
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove("syncing");
  }
}

// ── Wire up ──────────────────────────────────────────────────────────────────
syncBtn.addEventListener("click", handleSync);
