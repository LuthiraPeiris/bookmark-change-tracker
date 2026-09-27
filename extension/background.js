chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log("🎉 New bookmark detected!");

  console.log("Bookmark ID:", id);
  console.log("Title:", bookmark.title);
  console.log("URL:", bookmark.url);
});