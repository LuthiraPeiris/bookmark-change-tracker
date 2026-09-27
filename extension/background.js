const API_URL =
  "https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/bookmarks";


chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log("🎉 New bookmark detected!");

  console.log("Bookmark ID:", id);
  console.log("Title:", bookmark.title);
  console.log("URL:", bookmark.url);

  // Ignore folders because they don't have a URL
  if (!bookmark.url) {
    console.log("This is a bookmark folder. Skipping.");
    return;
  }

  try {
  console.log("📤 Sending bookmark to AWS...");

  const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  bookmarkId: id,
  title: bookmark.title || "Untitled",
  url: bookmark.url,
  source: "new-bookmark"
})
    });
    console.log("📥 AWS response received:", response.status);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${JSON.stringify(result)}`
      );
    }

    console.log("☁️ Bookmark registered with AWS:", result);

  } catch (error) {
    console.error(
      "❌ Failed to register bookmark with AWS:",
      error
    );
  }
});