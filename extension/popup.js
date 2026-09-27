"use strict";

// API endpoints
const API_URL =
  "https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/bookmarks";

const BOOKMARKS_API_URL =
  "https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/api/bookmarks";

// Maximum simultaneous POST requests.
// This stays well below the AWS Lambda concurrency limit of 10.
const MAX_CONCURRENCY = 3;

// Only normal web pages can be monitored.
const SUPPORTED_SCHEMES = ["http://", "https://"];

// DOM references
const syncBtn = document.getElementById("sync-btn");
const statusEl = document.getElementById("status");
const bookmarksSec = document.getElementById("bookmarks-section");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text == null ? "" : text);
  return div.innerHTML;
}

function displayHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isSupportedUrl(url) {
  for (var i = 0; i < SUPPORTED_SCHEMES.length; i++) {
    if (url.indexOf(SUPPORTED_SCHEMES[i]) === 0) {
      return true;
    }
  }

  return false;
}

function extractBookmarks(nodes) {
  const results = [];

  function walk(nodeList) {
    for (const node of nodeList) {
      if (node.url) {
        results.push({
          id: node.id,
          title: node.title || "Untitled",
          url: node.url
        });
      }

      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(nodes);

  return results;
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status status-" + (type || "idle");
}

// ─────────────────────────────────────────────────────────────────────────────
// Get bookmarks already registered in AWS
// ─────────────────────────────────────────────────────────────────────────────

async function getRegisteredBookmarkIds() {
  const response = await fetch(BOOKMARKS_API_URL, {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error("Unable to check existing bookmarks (HTTP " + response.status + ")");
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.bookmarks)) {
    throw new Error("Invalid response from bookmark API");
  }

  const ids = new Set();

  for (const bookmark of data.bookmarks) {
    if (bookmark.bookmarkId !== undefined && bookmark.bookmarkId !== null) {
      ids.add(String(bookmark.bookmarkId));
    }
  }

  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST one new bookmark
// ─────────────────────────────────────────────────────────────────────────────

async function registerBookmark(bookmark) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url
    })
  });

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency-limited worker pool
// ─────────────────────────────────────────────────────────────────────────────

async function pooledAllSettled(items, taskFn, concurrency, onProgress) {
  var total = items.length;
  var results = new Array(total);
  var index = 0;
  var done = 0;

  async function worker() {
    while (true) {
      var i = index++;

      if (i >= total) {
        break;
      }

      try {
        results[i] = {
          status: "fulfilled",
          value: await taskFn(items[i])
        };
      } catch (err) {
        results[i] = {
          status: "rejected",
          reason: err
        };
      }

      done++;

      onProgress(done, total);
    }
  }

  var workerCount = Math.min(concurrency, total);
  var workers = [];

  for (var w = 0; w < workerCount; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Render results
// ─────────────────────────────────────────────────────────────────────────────

function renderResults(eligible, outcomes, skippedCount) {
  if (eligible.length === 0 && skippedCount === 0) {
    bookmarksSec.innerHTML = "";
    return;
  }

  var rows = eligible
    .map(function (bookmark, i) {
      var outcome = outcomes[i];

      var ok = outcome.status === "fulfilled";

      var indicatorClass = ok ? "ok" : "failed";
      var resultClass = ok ? "ok" : "failed";
      var resultText = ok ? "✓ Synced" : "✗ Failed";

      return (
        '<div class="bookmark">' +
          '<div class="bookmark-indicator ' +
          indicatorClass +
          '" aria-hidden="true"></div>' +
          '<div class="bookmark-body">' +
            '<div class="bookmark-title" title="' +
            esc(bookmark.title) +
            '">' +
            esc(bookmark.title) +
            "</div>" +
            '<div class="bookmark-url" title="' +
            esc(bookmark.url) +
            '">' +
            esc(displayHost(bookmark.url)) +
            "</div>" +
          "</div>" +
          '<div class="bookmark-result ' +
          resultClass +
          '">' +
          resultText +
          "</div>" +
        "</div>"
      );
    })
    .join("");

  var label = eligible.length + " processed";

  if (skippedCount > 0) {
    label += " · " + skippedCount + " skipped";
  }

  bookmarksSec.innerHTML =
    '<div class="section-label">Results (' +
    label +
    ")</div>" +
    rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sync handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleSync() {
  syncBtn.disabled = true;
  syncBtn.classList.add("syncing");

  bookmarksSec.innerHTML = "";

  try {
    // 1. Read Chrome bookmarks
    setStatus("Reading your bookmarks…", "syncing");

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

    // 2. Filter supported web bookmarks
    const eligible = [];
    const skipped = [];

    for (var i = 0; i < allBookmarks.length; i++) {
      if (isSupportedUrl(allBookmarks[i].url)) {
        eligible.push(allBookmarks[i]);
      } else {
        skipped.push(allBookmarks[i]);
      }
    }

    if (eligible.length === 0) {
      var skipMessage =
        "No http/https bookmarks found.";

      if (skipped.length > 0) {
        skipMessage +=
          " " +
          skipped.length +
          " bookmark" +
          (skipped.length !== 1 ? "s" : "") +
          " skipped.";
      }

      setStatus(skipMessage, "idle");
      return;
    }

    // 3. Ask AWS which bookmarks are already registered
    setStatus(
      "Checking which bookmarks are already synced…",
      "syncing"
    );

    const registeredIds = await getRegisteredBookmarkIds();

    // 4. Find only NEW bookmarks
    const newBookmarks = [];

    for (var j = 0; j < eligible.length; j++) {
      var bookmark = eligible[j];

      if (!registeredIds.has(String(bookmark.id))) {
        newBookmarks.push(bookmark);
      }
    }

    // 5. Nothing new to sync
    if (newBookmarks.length === 0) {
      var alreadySyncedMessage =
        "✓ All " +
        eligible.length +
        " bookmarks are already synced.";

      if (skipped.length > 0) {
        alreadySyncedMessage +=
          " · " + skipped.length + " skipped";
      }

      setStatus(alreadySyncedMessage, "success");

      return;
    }

    // 6. Tell user how many are new
    setStatus(
      newBookmarks.length +
        " new bookmark" +
        (newBookmarks.length !== 1 ? "s" : "") +
        " found.",
      "syncing"
    );

    // 7. Register ONLY new bookmarks
    const outcomes = await pooledAllSettled(
      newBookmarks,
      registerBookmark,
      MAX_CONCURRENCY,
      function (done, total) {
        setStatus(
          "Syncing " +
            done +
            " of " +
            total +
            " new bookmark" +
            (total !== 1 ? "s" : "") +
            "…",
          "syncing"
        );
      }
    );

    // 8. Count results
    const succeeded = outcomes.filter(function (outcome) {
      return outcome.status === "fulfilled";
    }).length;

    const failed = outcomes.length - succeeded;

    // 9. Final status
    var statusMessage = "";

    if (failed === 0) {
      statusMessage =
        "✓ Synced " +
        succeeded +
        " new bookmark" +
        (succeeded !== 1 ? "s" : "");

      if (skipped.length > 0) {
        statusMessage +=
          " · " + skipped.length + " skipped";
      }

      setStatus(statusMessage, "success");
    } else if (succeeded === 0) {
      statusMessage =
        "Sync failed — " +
        failed +
        " new bookmark" +
        (failed !== 1 ? "s" : "") +
        " could not be registered";

      if (skipped.length > 0) {
        statusMessage +=
          " · " + skipped.length + " skipped";
      }

      setStatus(statusMessage, "error");
    } else {
      statusMessage =
        "Synced " +
        succeeded +
        " of " +
        newBookmarks.length +
        " new bookmarks · " +
        failed +
        " failed";

      if (skipped.length > 0) {
        statusMessage +=
          " · " + skipped.length + " skipped";
      }

      setStatus(statusMessage, "partial");
    }

    // 10. Show results for only the bookmarks that were actually uploaded
    renderResults(
      newBookmarks,
      outcomes,
      skipped.length
    );

  } catch (error) {
    console.error("Bookmark sync error:", error);

    setStatus(
      "Could not check existing bookmarks. Please try again.",
      "error"
    );
  } finally {
    syncBtn.disabled = false;
    syncBtn.classList.remove("syncing");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire up button
// ─────────────────────────────────────────────────────────────────────────────

syncBtn.addEventListener("click", handleSync);