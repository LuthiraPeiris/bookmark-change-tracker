import { createHash } from "node:crypto";
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const TABLE_NAME = "BookmarkChangeTracker";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap

const dynamo = new DynamoDBClient({ region: REGION });

// ---------------------------------------------------------------------------
// Content extraction & normalisation
// ---------------------------------------------------------------------------

function extractAndNormalise(html) {
  // 1. Remove entire tag blocks whose content is never visible/meaningful
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // 2. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 3. Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ");

  // 4. Remove URLs (http/https/ftp)
  text = text.replace(/https?:\/\/\S+/g, " ").replace(/ftp:\/\/\S+/g, " ");

  // 5. Lowercase and collapse whitespace
  text = text.toLowerCase().replace(/\s+/g, " ").trim();

  return text;
}

function sha256(str) {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Fetch with timeout and response-size cap
// ---------------------------------------------------------------------------

async function fetchWithLimits(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Present a browser-like UA to reduce bot-blocking
        "User-Agent":
          "Mozilla/5.0 (compatible; BookmarkChangeTracker/1.0; +https://github.com/)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    // Read the body in chunks, stopping at MAX_RESPONSE_BYTES
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      chunks.push(value);
      if (totalBytes >= MAX_RESPONSE_BYTES) {
        await reader.cancel();
        break;
      }
    }

    const combined = new Uint8Array(totalBytes > MAX_RESPONSE_BYTES ? MAX_RESPONSE_BYTES : totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(combined);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// DynamoDB helpers
// ---------------------------------------------------------------------------

async function getActiveBookmarks() {
  const items = [];
  let lastKey;

  do {
    const cmd = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "#s = :active",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: marshall({ ":active": "ACTIVE" }),
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    });

    const response = await dynamo.send(cmd);
    (response.Items ?? []).forEach((item) => items.push(unmarshall(item)));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

async function updateBookmark(bookmarkId, newHash, changed, lastChangedAt) {
  const now = new Date().toISOString();

  const ExpressionAttributeNames = {
    "#lh": "lastHash",
    "#lc": "lastChecked",
    "#ch": "changed",
  };
  const ExpressionAttributeValues = {
    ":newHash": { S: newHash },
    ":now": { S: now },
    ":changed": { BOOL: changed },
  };

  let UpdateExpression =
    "SET #lh = :newHash, #lc = :now, #ch = :changed";

  if (changed && lastChangedAt) {
    UpdateExpression += ", #lca = :lca";
    ExpressionAttributeNames["#lca"] = "lastChangedAt";
    ExpressionAttributeValues[":lca"] = { S: lastChangedAt };
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { bookmarkId: { S: String(bookmarkId) } },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    })
  );
}

// ---------------------------------------------------------------------------
// Per-bookmark processing
// ---------------------------------------------------------------------------

async function processBookmark(bookmark) {
  const { bookmarkId, url, title } = bookmark;
  const previousHash = bookmark.lastHash ?? null; // null when stored as DynamoDB NULL

  let html;
  try {
    html = await fetchWithLimits(url);
  } catch (err) {
    return {
      bookmarkId,
      url,
      title,
      status: "FETCH_ERROR",
      error: err.message,
    };
  }

  const normalised = extractAndNormalise(html);
  const newHash = sha256(normalised);

  // First check — no previous hash stored
  if (!previousHash) {
    await updateBookmark(bookmarkId, newHash, false, null);
    return { bookmarkId, url, title, status: "FIRST_CHECK", hash: newHash };
  }

  const changed = newHash !== previousHash;
  const lastChangedAt = changed ? new Date().toISOString() : undefined;

  await updateBookmark(bookmarkId, newHash, changed, lastChangedAt);

  return {
    bookmarkId,
    url,
    title,
    status: changed ? "CHANGED" : "UNCHANGED",
    hash: newHash,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(event) {
  console.log("check-websites starting");

  const bookmarks = await getActiveBookmarks();
  console.log(`Found ${bookmarks.length} active bookmark(s)`);

  if (bookmarks.length === 0) {
    return { checked: 0, results: [] };
  }

  const settled = await Promise.allSettled(
    bookmarks.map((b) => processBookmark(b))
  );

  const results = settled.map((outcome) => {
    if (outcome.status === "fulfilled") return outcome.value;
    return { status: "UNHANDLED_ERROR", error: outcome.reason?.message };
  });

  const summary = {
    checked: results.length,
    firstCheck: results.filter((r) => r.status === "FIRST_CHECK").length,
    changed: results.filter((r) => r.status === "CHANGED").length,
    unchanged: results.filter((r) => r.status === "UNCHANGED").length,
    errors: results.filter((r) => r.status === "FETCH_ERROR" || r.status === "UNHANDLED_ERROR").length,
  };

  console.log("Summary:", JSON.stringify(summary));
  console.log("Results:", JSON.stringify(results));

  return { summary, results };
}
