import {
  DynamoDBClient,
  PutItemCommand
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});

const TABLE_NAME = "BookmarkChangeTracker";

// These are OUR categories.
// The AI is only allowed to choose one of them.
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

async function categorizeWithAI(title, url) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not configured");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",

        temperature: 0,

        messages: [
          {
            role: "system",
            content: `
You are a bookmark categorization assistant.

Your task is to classify a browser bookmark into exactly ONE
of the provided categories.

You must choose ONLY from the following categories:

${CATEGORIES.map((category) => `- ${category}`).join("\n")}

Use both the bookmark title and URL to understand what the
bookmark is about.

Choose the category that best represents the primary purpose
of the bookmark.

Do not create new categories.
Do not return "Other".
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
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Groq API error ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response");
  }

  const result = JSON.parse(content);

  if (!CATEGORIES.includes(result.category)) {
    throw new Error(
      `Invalid category returned by Groq: ${result.category}`
    );
  }

  return result.category;
}


export const handler = async (event) => {
  try {
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body;

    const { bookmarkId, title, url, source } = body || {};

    if (!bookmarkId || !url) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          message: "bookmarkId and url are required"
        })
      };
    }

    let category = null;

if (source === "new-bookmark") {
  console.log("🧠 New bookmark detected — classifying with Groq:", {
    bookmarkId,
    title,
    url
  });

  category = await categorizeWithAI(title, url);

  console.log("AI category:", category);
} else {
  console.log("📥 Initial sync — skipping AI categorization:", {
    bookmarkId,
    title,
    url
  });
}

    const item = {
      bookmarkId: {
        S: String(bookmarkId)
      },

      title: {
        S: title || "Untitled"
      },

      url: {
        S: url
      },

      ...(category
  ? {
      category: {
        S: category
      }
    }
  : {}),

      status: {
        S: "ACTIVE"
      },

      createdAt: {
        S: new Date().toISOString()
      }
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item
      })
    );

    return {
      statusCode: 201,

      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },

      body: JSON.stringify({
        message: "Bookmark registered successfully",
        bookmarkId,
        category: category || null,
        source: source || "unknown"
      })
    };

  } catch (error) {
    console.error("Error registering bookmark:", error);

    return {
      statusCode: 500,

      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },

      body: JSON.stringify({
        message: "Internal server error",
        error: error.message
      })
    };
  }
};