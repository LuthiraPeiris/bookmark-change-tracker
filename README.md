# 🔖 Bookmark Library 

> **An AI-powered Chrome bookmark organizer and website change tracker,
> built and shipped on AWS.**

Bookmark Change Tracker solves a simple but growing problem: browser
bookmarks become difficult to organize and easy to forget.

The application automatically detects newly created Chrome bookmarks,
uses AI to suggest a category, stores the bookmark in Amazon DynamoDB,
and provides a public dashboard where users can search, filter, and
override AI-generated categories.

It also includes scheduled website monitoring so bookmarked websites can
be checked automatically for content changes.

------------------------------------------------------------------------
## Architecture Diagram
![Image Alt](https://github.com/LuthiraPeiris/bookmark-change-tracker/blob/9f222cef39b58d781075f560f0570483dacf004a/public/architecture.png)


## 🏆 AWS Zero to Shipped Hackathon 

**Hackathon:** AWS Zero to Shipped Hackathon 2026\
**Project:** Bookmark Library\
**Application Category:** Daily-Life Enhancement\
**Focus Track:** Community\
**Status:** Live and publicly accessible on AWS

### Ship Gate

The project is deployed as a live public AWS application.

**Live Application:**\
<https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/>

The project also includes documented evidence of the coding-agent
connection to AWS and the development process required by the hackathon.

------------------------------------------------------------------------

## 🎯 The Problem 

Browser bookmarks are useful, but bookmark collections quickly become
difficult to manage.

Users may accumulate hundreds of saved websites covering development,
AWS, AI, learning, articles, tools, shopping, travel, social profiles,
books, and entertainment.

The problem is not saving the bookmark. The problem is managing the
collection afterwards.

Users need a simple way to:

1.  Automatically capture new bookmarks.
2.  Organize them without manually classifying every new item.
3.  Search and filter a large collection.
4.  Correct an AI-generated category when it is not what they want.
5.  Keep track of websites they care about when those websites change.

------------------------------------------------------------------------

## 💡 The Solution 

Bookmark Change Tracker connects the user\'s Chrome bookmarks to a
serverless AWS backend.

### New bookmark workflow

``` text
User bookmarks a website
        ↓
Chrome Extension detects it
        ↓
Amazon API Gateway
        ↓
register-bookmark Lambda
        ↓
Groq AI categorization
        ↓
Amazon DynamoDB
        ↓
Public Bookmark Dashboard
```

### Website monitoring workflow

``` text
Amazon EventBridge Scheduler
        ↓
check-websites Lambda
        ↓
Fetch bookmarked websites
        ↓
Compare website content information
        ↓
Amazon DynamoDB
        ↓
Dashboard
```

AI assists the user rather than taking away control. AI suggests the
initial category, while the user can change that category at any time.

------------------------------------------------------------------------

## ✨ Core Features

### 🔖 Automatic Bookmark Detection 

The Chrome extension listens for newly created bookmarks. When a normal
HTTP/HTTPS website is bookmarked, the extension sends the bookmark title
and URL to the AWS backend.

### 🤖 AI-Powered Categorization 

New bookmarks are categorized automatically using the Groq API.

The AI is restricted to these application-defined categories:

-   Development
-   AWS & Cloud
-   AI
-   Learning
-   Articles
-   Tools
-   Social & Profiles
-   Books
-   Movies & Entertainment
-   Hardware & Electronics
-   Shopping
-   Travel & Places
-   Searches

### ✏️ User-Controlled AI Override 

Every bookmark in the dashboard has a category selector. Users can
change the AI-generated category and save the new category to DynamoDB.

``` text
AI suggests category
        ↓
User reviews it
        ↓
User selects another category
        ↓
Save
        ↓
Amazon DynamoDB
```

### 🔎 Search and Filtering 

Search by bookmark title, URL, domain, or category and filter the
collection by category.

### 🌐 Website Change Monitoring 

Amazon EventBridge Scheduler triggers the `check-websites` Lambda
function to check bookmarked websites and compare their current content
information with the previously stored state.

### 🌓 Light and Dark Mode 

The dashboard supports light and dark themes, with the selected theme
stored locally in the browser.

------------------------------------------------------------------------

## ☁️ AWS Architecture 

``` text
                         ┌─────────────────────┐
                         │   Chrome Extension  │
                         └──────────┬──────────┘
                                    │
                           New bookmark
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Amazon API Gateway│
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ register-bookmark   │
                         │      Lambda         │
                         └──────────┬──────────┘
                                    │
                              AI categorization
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Groq AI API     │
                         └─────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Amazon DynamoDB   │
                         │ BookmarkChangeTracker│
                         └───────┬─────┬───────┘
                                 │     │
                    Dashboard    │     │ Scheduled checks
                                 │     │
                                 ▼     ▼
                  ┌────────────────┐  ┌──────────────────┐
                  │ bookmark-      │  │ EventBridge      │
                  │ dashboard      │  │ Scheduler        │
                  │ Lambda         │  └────────┬─────────┘
                  └───────┬────────┘           │
                          │                    ▼
                          │           ┌──────────────────┐
                          │           │ check-websites   │
                          │           │ Lambda           │
                          │           └──────────────────┘
                          │
                          ▼
                  ┌─────────────────────┐
                  │ Public Web Dashboard│
                  └─────────────────────┘
```

------------------------------------------------------------------------

## 🛠️ AWS Services

| AWS Service | Role |
| --- | --- |
| **Amazon API Gateway** | Public HTTP API for the Chrome extension and dashboard |
| **AWS Lambda** | Serverless application logic |
| **Amazon DynamoDB** | Stores bookmarks, categories, timestamps, and monitoring state |
| **Amazon EventBridge Scheduler** | Triggers scheduled website checks |
| **AWS IAM** | Controls access between Lambda and AWS services |
| **Amazon CloudWatch** | Lambda logging and operational monitoring |

The architecture uses serverless/on-demand services to avoid unnecessary
always-running infrastructure.

------------------------------------------------------------------------

## 🤖 Coding Agent + AWS 

A core requirement of the AWS Zero to Shipped Hackathon is building with
a coding agent connected to AWS.

This project was developed using a coding agent connected to the AWS
environment.

The coding-agent workflow was used to:

-   Build and modify application code
-   Configure AWS resources
-   Work with Lambda functions
-   Configure API Gateway routes
-   Configure DynamoDB access
-   Configure scheduled execution
-   Test AWS integrations
-   Debug deployment issues
-   Verify the public application

### Documented proof

The project includes a set of screenshots documenting the
coding-agent/AWS development process, including AWS resource
configuration, EventBridge scheduling, public deployment verification,
and the live application.

------------------------------------------------------------------------

## 🔄 Development Journey 

### Phase 1 --- Identify the problem 

The initial problem was excessive and unorganized Chrome bookmarks.

### Phase 2 --- Define the MVP 

The MVP was reduced to a small serverless architecture:

-   Chrome Extension
-   API Gateway
-   Lambda
-   DynamoDB
-   EventBridge Scheduler
-   Public dashboard

### Phase 3 --- Add AI 

AI categorization was introduced for newly created bookmarks,
constrained to a fixed set of application categories.

### Phase 4 --- Add user control 

The dashboard was extended so users can manually override an
AI-generated category.

### Phase 5 --- Ship publicly 

The application was deployed through AWS API Gateway and Lambda and made
publicly accessible.

### Phase 6 --- MVP verification 

The final MVP was tested across new bookmark registration, AI
categorization, manual category override, category persistence, search,
filtering, theme switching, website monitoring, and public dashboard
access.

------------------------------------------------------------------------

## 📁 Project Structure 

``` text
bookmark-change-tracker/
│
├── backend/
│   └── functions/
│       ├── bookmark-dashboard/
│       ├── check-websites/
│       └── register-bookmark/
│
├── extension/
│   ├── background.js
│   ├── manifest.json
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
│
├── infrastructure/
│   ├── scheduler-invoke-policy.json
│   ├── scheduler-target.json
│   └── scheduler-trust-policy.json
│
├── tools/
│   ├── categorize-bookmarks.mjs
│   ├── package.json
│   └── reset-bookmark-categories.mjs
│
├── cors-config.json
├── .gitignore
└── README.md
```

------------------------------------------------------------------------

## 🚀 Run the Chrome Extension 

### 1. Clone the repository 

``` bash
git clone https://github.com/LuthiraPeiris/bookmark-change-tracker.git
cd bookmark-change-tracker
```

### 2. Open Chrome Extensions 

Open:

``` text
chrome://extensions
```

Enable **Developer mode**.

### 3. Load the extension 

Select **Load unpacked** and choose:

``` text
extension/
```

### 4. Create a bookmark 

Bookmark a normal HTTP/HTTPS website. The extension detects it and sends
it to the deployed AWS backend.

------------------------------------------------------------------------

## 🔐 Configuration 

The Groq API key is not stored in the Chrome extension or committed to
the repository.

The backend Lambda function uses:

``` text
GROQ_API_KEY
```

AWS IAM policies provide the required DynamoDB permissions to the Lambda
functions.

------------------------------------------------------------------------

## 🌐 Live Application

**Public Dashboard**

<https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/>

**Bookmarks API**

<https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/api/bookmarks>

**Bookmark Registration API**

<https://ykp7sgqc50.execute-api.us-east-1.amazonaws.com/bookmarks>

------------------------------------------------------------------------

## 🧪 MVP Status

| Capability | Status |
| --- | --- |
| Chrome bookmark detection | ✅ Complete |
| AWS bookmark registration | ✅ Complete |
| AI categorization for new bookmarks | ✅ Complete |
| DynamoDB persistence | ✅ Complete |
| Public dashboard | ✅ Complete |
| Search | ✅ Complete |
| Category filtering | ✅ Complete |
| Manual categorization | ✅ Complete |
| AI category override | ✅ Complete |
| Category persistence | ✅ Complete |
| Scheduled website monitoring | ✅ Complete |
| Light / dark mode | ✅ Complete |
| Public AWS deployment | ✅ Complete |

------------------------------------------------------------------------

## 📌 Hackathon Requirement Checklist

| Zero to Shipped requirement | Project evidence |
| --- | --- |
| **Live public application on AWS** | Public API Gateway dashboard |
| **Coding agent connected to AWS** | Documented screenshots/evidence |
| **New application** | Built specifically around the bookmark-management problem |
| **App category** | Daily-Life Enhancement |
| **Focus track** | Community |
| **AWS Builder Center project** | Project documentation and development details |
| **Accessible to AI and human judges** | Public dashboard/API |
| **AWS-based implementation** | API Gateway, Lambda, DynamoDB, EventBridge, IAM, CloudWatch |

------------------------------------------------------------------------

## 🔮 Future Improvements 

The current submission intentionally focuses on the MVP.

Possible future improvements include:

-   AI-generated summaries of website changes
-   User notifications for important changes
-   Browser notifications
-   User-defined categories
-   Multi-user accounts
-   Additional browser support
-   More advanced website change detection
-   AI-assisted bookmark search
-   Similar-bookmark detection

------------------------------------------------------------------------

## 👨‍💻 Author 

**Luthira Peiris**

BSc Software Engineering\
Cloud / AWS / DevOps

-   GitHub: <https://github.com/LuthiraPeiris>
-   LinkedIn: <https://www.linkedin.com/in/luthirapeiris/>
-   Portfolio: <https://www.luthirame.com/>

------------------------------------------------------------------------

## 📄 License

This project was created as a hackathon and learning project.
