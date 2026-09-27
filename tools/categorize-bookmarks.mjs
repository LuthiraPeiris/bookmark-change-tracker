import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "BookmarkChangeTracker";
const REGION = "us-east-1";

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODEL = "openai/gpt-oss-20b";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error(
    "GROQ_API_KEY environment variable is not set."
  );
}

const client = new DynamoDBClient({
  region: REGION
});

const CATEGORIES = [
  "Development",
  "AWS & Cloud",
  "AI",
  "Learning",
  "Articles",
  "Tools",
  "Social & Profiles",
  "Books",
  "Movies & Entertainment",
  "Hardware & Electronics",
  "Shopping",
  "Travel & Places",
  "Searches"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function classifyBookmark(title, url) {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },

    body: JSON.stringify({
      model: GROQ_MODEL,

      temperature: 0,

      messages: [
        {
          role: "system",

          content: `
You are a browser bookmark categorization assistant.

Classify the bookmark into exactly ONE category.

You may ONLY choose from these categories:

${CATEGORIES.map(c => `- ${c}`).join("\n")}

Use both the bookmark title and URL.

Choose the category that best represents the primary
purpose or subject of the bookmark.

Do NOT create a new category.
Do NOT return "Other".
Return exactly one category.
          `.trim()
        },

        {
          role: "user",

          content: JSON.stringify({
            title: title || "Untitled",
            url
          })
        }
      ],

      response_format: {
        type: "json_schema",

        json_schema: {
          name: "bookmark_category",

          strict: true,

          schema: {
            type: "object",

            properties: {
              category: {
                type: "string",
                enum: CATEGORIES
              }
            },

            required: ["category"],

            additionalProperties: false
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Groq ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  const content =
    data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  const result = JSON.parse(content);

  if (!CATEGORIES.includes(result.category)) {
    throw new Error(
      `Invalid category: ${result.category}`
    );
  }

  return result.category;
}


async function getAllBookmarks() {
  const bookmarks = [];

  let ExclusiveStartKey;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,

        ProjectionExpression:
          "bookmarkId, #title, #url, category",

        ExpressionAttributeNames: {
          "#title": "title",
          "#url": "url"
        },

        ExclusiveStartKey
      })
    );

    for (const item of result.Items || []) {
      bookmarks.push({
        bookmarkId: item.bookmarkId?.S,
        title: item.title?.S || "Untitled",
        url: item.url?.S,
        category: item.category?.S
      });
    }

    ExclusiveStartKey = result.LastEvaluatedKey;

  } while (ExclusiveStartKey);

  return bookmarks;
}


async function updateCategory(bookmarkId, category) {
  await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,

      Key: {
        bookmarkId: {
          S: bookmarkId
        }
      },

      UpdateExpression:
        "SET #category = :category",

      ExpressionAttributeNames: {
        "#category": "category"
      },

      ExpressionAttributeValues: {
        ":category": {
          S: category
        }
      }
    })
  );
}


async function main() {
  console.log("");
  console.log("========================================");
  console.log(" AI BOOKMARK CATEGORIZATION");
  console.log("========================================");
  console.log("");

  console.log("Reading bookmarks from DynamoDB...");
  const bookmarks = await getAllBookmarks();

  const uncategorizedBookmarks = bookmarks.filter(
    bookmark => !bookmark.category
  );

  console.log(`Found ${bookmarks.length} bookmarks.`);
  console.log(
    `Already categorized: ${
      bookmarks.length - uncategorizedBookmarks.length
    }`
  );
  console.log(
    `Remaining to categorize: ${uncategorizedBookmarks.length}`
  );

  console.log("");

  let completed = 0;
  let failed = 0;

  const categoryCounts = {};

  for (const bookmark of uncategorizedBookmarks) {
    completed++;

    console.log(
      `[${completed}/${uncategorizedBookmarks.length}] ${bookmark.title}`
    );

    try {
      const category = await classifyBookmark(
        bookmark.title,
        bookmark.url
      );

      await updateCategory(
        bookmark.bookmarkId,
        category
      );

      categoryCounts[category] =
        (categoryCounts[category] || 0) + 1;

      console.log(`    → ${category}`);

    } catch (error) {
      failed++;

      console.error(
        `    ✗ FAILED: ${error.message}`
      );
    }

    // Small delay between requests.
    await sleep(500);
  }

  console.log("");
  console.log("========================================");
  console.log(" BACKFILL COMPLETE");
  console.log("========================================");

  console.log(`Processed: ${completed}`);
  console.log(`Failed: ${failed}`);

  console.log("");

  console.log("Category distribution:");

  for (const category of CATEGORIES) {
    console.log(
      `  ${category}: ${categoryCounts[category] || 0}`
    );
  }

  console.log("");
}


main().catch(error => {
  console.error("");
  console.error("BACKFILL FAILED");
  console.error(error);
  process.exit(1);
});