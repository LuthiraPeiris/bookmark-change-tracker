import {
  DynamoDBClient,
  PutItemCommand
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});

// ---------------------------------------------------------------------------
// Rule-based categorization
// Inspects the bookmark title and hostname to assign one of seven categories.
// Returns "Other" when no rule matches confidently.
// ---------------------------------------------------------------------------

const RULES = [
  {
    category: "AWS & Cloud",
    domains: ["aws.amazon.com", "console.aws.amazon.com", "docs.aws.amazon.com",
              "cloud.google.com", "azure.microsoft.com", "cloudflare.com",
              "vercel.com", "netlify.com", "heroku.com", "digitalocean.com",
              "terraform.io", "pulumi.com"],
    keywords: ["aws", "amazon web services", "azure", "gcp", "google cloud",
                "cloudformation", "lambda", "s3 bucket", "ec2", "dynamodb",
                "kubernetes", "docker hub", "cloud"]
  },
  {
    category: "Development",
    domains: ["github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
              "developer.mozilla.org", "npmjs.com", "pypi.org", "rubygems.org",
              "pkg.go.dev", "crates.io", "docs.rs", "jsfiddle.net",
              "codepen.io", "replit.com", "codesandbox.io"],
    keywords: ["github", "gitlab", "repository", "npm ", "api docs",
                "documentation", "sdk", "framework", "library", "plugin",
                "typescript", "javascript", "python", "golang", "rust",
                "react", "vue", "angular", "node.js", "django", "rails",
                "programming", "developer", "devops", "regex", "json"]
  },
  {
    category: "Learning",
    domains: ["coursera.org", "udemy.com", "edx.org", "pluralsight.com",
              "linkedin.com/learning", "khanacademy.org", "freecodecamp.org",
              "codecademy.org", "egghead.io", "frontendmasters.com",
              "brilliant.org", "udacity.com", "skillshare.com",
              "youtube.com", "youtu.be"],
    keywords: ["tutorial", "course", "learn", "learning", "guide", "how to",
                "introduction to", "getting started", "beginner", "advanced",
                "workshop", "lecture", "bootcamp", "certification", "training"]
  },
  {
    category: "Articles",
    domains: ["medium.com", "dev.to", "hashnode.com", "substack.com",
              "blog.", "news.ycombinator.com", "reddit.com", "lobste.rs",
              "smashingmagazine.com", "css-tricks.com", "alistapart.com",
              "thenewstack.io", "infoq.com"],
    keywords: ["blog", "article", "post", "essay", "opinion", "weekly",
                "digest", "newsletter", "hacker news", "reading"]
  },
  {
    category: "Tools",
    domains: ["figma.com", "notion.so", "airtable.com", "trello.com",
              "jira.atlassian.com", "confluence.atlassian.com",
              "linear.app", "miro.com", "excalidraw.com",
              "regex101.com", "jsonformatter.org", "caniuse.com",
              "bundlephobia.com", "httpstat.us", "requestbin.com",
              "postman.com", "insomnia.rest"],
    keywords: ["tool", "playground", "editor", "formatter", "converter",
                "generator", "calculator", "simulator", "dashboard",
                "monitor", "analytics", "productivity"]
  },
  {
    category: "Social",
    domains: ["twitter.com", "x.com", "linkedin.com", "facebook.com",
              "instagram.com", "mastodon.social", "threads.net",
              "discord.com", "slack.com", "telegram.org",
              "producthunt.com"],
    keywords: ["twitter", "linkedin", "facebook", "instagram", "profile",
                "community", "forum", "discuss", "network"]
  }
];

function categorize(title, url) {
  const t = (title || "").toLowerCase();
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { /* skip */ }

  for (const rule of RULES) {
    // Domain match
    for (const d of rule.domains) {
      if (hostname === d || hostname.endsWith("." + d) || hostname.startsWith(d)) {
        return rule.category;
      }
    }
    // Keyword match in title
    for (const kw of rule.keywords) {
      if (t.includes(kw)) return rule.category;
    }
  }

  return "Other";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const TABLE_NAME = "BookmarkChangeTracker";

export const handler = async (event) => {
  try {
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body;

    const { bookmarkId, title, url } = body;

    if (!bookmarkId || !url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "bookmarkId and url are required" })
      };
    }

    const category = categorize(title, url);

    const item = {
      bookmarkId: { S: String(bookmarkId) },
      title:      { S: title || "Untitled" },
      url:        { S: url },
      category:   { S: category },
      status:     { S: "ACTIVE" },
      createdAt:  { S: new Date().toISOString() }
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Bookmark registered successfully",
        bookmarkId,
        category
      })
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" })
    };
  }
};
