const bookmarksContainer = document.getElementById("bookmarks");

chrome.bookmarks.getTree((bookmarkTree) => {
  const bookmarks = [];

  function extractBookmarks(nodes) {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          title: node.title || "Untitled",
          url: node.url
        });
      }

      if (node.children) {
        extractBookmarks(node.children);
      }
    }
  }

  extractBookmarks(bookmarkTree);

  if (bookmarks.length === 0) {
    bookmarksContainer.innerHTML = `
      <p>No bookmarks found.</p>
    `;
    return;
  }

  bookmarksContainer.innerHTML = bookmarks
    .map(
      (bookmark) => `
        <div class="bookmark">
          <div class="bookmark-title">
            ${escapeHtml(bookmark.title)}
          </div>

          <div class="bookmark-url">
            ${escapeHtml(bookmark.url)}
          </div>
        </div>
      `
    )
    .join("");
});


function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}