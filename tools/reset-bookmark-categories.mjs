import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "BookmarkChangeTracker";
const REGION = "us-east-1";

const client = new DynamoDBClient({
  region: REGION
});

async function getAllBookmarks() {
  const bookmarks = [];
  let ExclusiveStartKey;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "bookmarkId, #category",
        ExpressionAttributeNames: {
          "#category": "category"
        },
        ExclusiveStartKey
      })
    );

    for (const item of result.Items || []) {
      bookmarks.push({
        bookmarkId: item.bookmarkId?.S,
        category: item.category?.S
      });
    }

    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return bookmarks;
}

async function removeCategory(bookmarkId) {
  await client.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        bookmarkId: {
          S: bookmarkId
        }
      },
      UpdateExpression: "REMOVE #category",
      ExpressionAttributeNames: {
        "#category": "category"
      }
    })
  );
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log(" RESET BOOKMARK CATEGORIES");
  console.log("========================================");
  console.log("");

  console.log("Reading bookmarks from DynamoDB...");

  const bookmarks = await getAllBookmarks();

  const categorized = bookmarks.filter(
    bookmark => bookmark.category
  );

  console.log(`Total bookmarks: ${bookmarks.length}`);
  console.log(
    `Bookmarks with categories: ${categorized.length}`
  );
  console.log("");

  if (categorized.length === 0) {
    console.log("Nothing to reset.");
    return;
  }

  console.log("Removing categories...");

  let completed = 0;
  let failed = 0;

  for (const bookmark of categorized) {
    try {
      await removeCategory(bookmark.bookmarkId);

      completed++;

      console.log(
        `[${completed}/${categorized.length}] Reset`
      );

    } catch (error) {
      failed++;

      console.error(
        `FAILED: ${bookmark.bookmarkId}`
      );

      console.error(error.message);
    }
  }

  console.log("");
  console.log("========================================");
  console.log(" RESET COMPLETE");
  console.log("========================================");

  console.log(`Reset: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log("");
}

main().catch(error => {
  console.error("");
  console.error("RESET FAILED");
  console.error(error);
  process.exit(1);
});