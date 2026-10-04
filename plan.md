# 📸 Meta Instagram Reels Auto-Publisher Plan (GitHub Actions)

This document outlines the complete architectural design, execution flow, Meta Graph API integration, and GitHub Actions automation plan to publish IPO videos as **Instagram Reels** alongside YouTube Shorts directly from **Google Drive**.

---

## 1. End-to-End Architectural Flowchart

```mermaid
flowchart TD
    subgraph Trigger ["1. Trigger Layer"]
        A1["GitHub Actions Cron\n• Morning: 09:30 AM IST (04:00 UTC)\n• Evening: 07:30 PM IST (14:00 UTC)"]
        A2["Manual Trigger\n(workflow_dispatch)"]
    end

    subgraph Ingestion ["2. Drive Ingestion & Validation"]
        A1 & A2 --> B["Scan Google Drive Root\n'IPO Automation'"]
        B --> C{"Check Trackers\nAlready Published\non YouTube & IG?"}
        C -- "Both Done" --> D["Skip: Candidate Already Handled"]
        C -- "Pending Platform" --> E{"Verify .mp4\nVideo File Exists?"}
        E -- "No .mp4" --> F["⚠️ Log & Exit Gracefully (Exit 0)"]
        E -- "Ready" --> G["Download Assets to temp/\n• video.mp4\n• ipo_data.json\n• script.txt"]
    end

    subgraph AI_Engine ["3. AI Viral Metadata Engine (Groq Cloud)"]
        G --> H["Groq Llama 3.3 / Qwen 3.8"]
        H --> I1["YouTube Metadata\n• Strict Title ≤ 65 chars (#Shorts)\n• SEO Description & Tags\n• Pinned Engagement Comment"]
        H --> I2["Instagram Reels Metadata\n• First-Line Visual Hook\n• Financial Breakdown with Emojis\n• Viral CTA (Comment / Save)\n• 20-25 Targeted IPO & Stock Hashtags"]
    end

    subgraph Publishing ["4. Dual-Platform Publishing Engine"]
        subgraph YouTube_Flow ["YouTube Shorts"]
            I1 --> YT1["YouTube Data API v3\nResumable Video Stream"]
            YT1 --> YT2["24-Hour Forward Scheduling\n(Morning/Evening Slot Buffer)"]
            YT2 --> YT3["Auto-Insert Pinned Comment"]
            YT3 --> YT4["Save data/uploaded_youtube.json"]
        end

        subgraph Instagram_Flow ["Instagram Reels (Meta Graph API)"]
            I2 --> IG1["Initialize Resumable Container\nPOST graph.facebook.com/v21.0/{IG_ID}/media\nupload_type=resumable & media_type=REELS"]
            IG1 --> IG2["Stream Binary MP4 Data\nPOST rupload.facebook.com/ig-api-upload/v21.0/{container_id}\n(Direct binary upload - No S3 bucket needed!)"]
            IG2 --> IG3["Poll Container Status\nGET /{container_id}?fields=status_code\nWait until status === 'FINISHED'"]
            IG3 --> IG4["Publish Reel\nPOST /{IG_ID}/media_publish?creation_id={container_id}"]
            IG4 --> IG5["Save data/uploaded_instagram.json"]
        end
    end

    subgraph Archival ["5. Archival & State Persistence"]
        YT4 & IG5 --> J{"Both Platforms\nCompleted?"}
        J -- Yes --> K["Move Folder to 'Uploaded/' on Google Drive\n(Zero Clutter in Incoming Root)"]
        J -- Partial --> L["Keep in Root for Next Run"]
        K & L --> M["Purge Local temp/ Cache"]
        M --> N["Git Auto-Commit [skip ci]\nPush Updated Trackers to GitHub"]
    end
```

---

## 2. Why Meta Graph API Resumable Upload is Perfect for GitHub Actions

Traditional Instagram automation typically suffers from two issues:
1. **Third-party hosting requirement**: Standard API usually requires a public AWS S3 URL.
2. **Account ban risk**: Unofficial mobile APIs (Puppeteer / Private APIs) get blocked immediately on datacenter IPs like GitHub Actions.

### The Solution: Meta Direct Resumable Upload (`rupload.facebook.com`)
Meta's official Instagram Graph API includes a **resumable binary upload endpoint**. This allows GitHub Actions to stream the local `video.mp4` directly to Meta's servers with **zero third-party hosting**, **zero cloud storage costs**, and **100% official safety**.

---

## 3. Detailed 3-Step Instagram Reels API Protocol

```mermaid
sequenceDiagram
    autonumber
    participant GHA as GitHub Actions Runner
    participant Graph as Meta Graph API (graph.facebook.com)
    participant RUpload as Meta Upload Server (rupload.facebook.com)
    participant IG as Instagram Platform

    Note over GHA: Video downloaded to temp/video.mp4

    %% Step 1: Init
    GHA->>Graph: POST /{IG_USER_ID}/media<br/>upload_type=resumable&media_type=REELS&caption={caption}
    Graph-->>GHA: Returns { id: "CONTAINER_ID" }

    %% Step 2: Binary Upload
    Note over GHA: Read local MP4 file size & stream
    GHA->>RUpload: POST /ig-api-upload/v21.0/{CONTAINER_ID}<br/>Headers: Authorization, offset=0, file_size={bytes}<br/>Body: [Binary MP4 Stream]
    RUpload-->>GHA: Returns HTTP 200 { success: true }

    %% Step 3: Polling Loop
    loop Every 5 seconds (Max 3 mins)
        GHA->>Graph: GET /{CONTAINER_ID}?fields=status_code
        Graph-->>GHA: { status_code: "IN_PROGRESS" | "FINISHED" | "ERROR" }
    end

    %% Step 4: Publish
    GHA->>Graph: POST /{IG_USER_ID}/media_publish?creation_id={CONTAINER_ID}
    Graph->>IG: Publish Reel to Profile & Reels Feed
    Graph-->>GHA: Returns { id: "MEDIA_ID" }
```

### Protocol Breakdown:
1. **Phase 1: Create Container**
   - Endpoint: `POST https://graph.facebook.com/v21.0/${INSTAGRAM_ACCOUNT_ID}/media`
   - Parameters:
     - `upload_type`: `"resumable"`
     - `media_type`: `"REELS"`
     - `caption`: AI-generated caption with hook, snapshot, disclaimer & hashtags
     - `share_to_feed`: `true` (Shares to both Reels tab and main profile grid)
     - `access_token`: Permanent Page Access Token

2. **Phase 2: Stream Binary Video**
   - Endpoint: `POST https://rupload.facebook.com/ig-api-upload/v21.0/${containerId}`
   - Headers:
     - `Authorization: OAuth ${INSTAGRAM_ACCESS_TOKEN}`
     - `file_size: ${fileSizeBytes}`
     - `offset: 0`
   - Body: Raw read-stream of the local `.mp4` file.

3. **Phase 3: Wait & Publish**
   - Polling: Queries `status_code` every 5 seconds until it transitions from `IN_PROGRESS` to `FINISHED`.
   - Publish: Calls `POST https://graph.facebook.com/v21.0/${INSTAGRAM_ACCOUNT_ID}/media_publish` with `creation_id`.

---

## 4. AI Viral Caption Strategy for Instagram Reels

Unlike YouTube Shorts (which relies on title keywords), Instagram Reels algorithm indexes the **caption** for Explore and search ranking.

### Reel Caption Architecture:
```text
🚨 [Brand Name] IPO: Apply or Avoid? Honest Review! 👇
────────────────────────────────────────
Should you invest in [Brand Name] IPO? Here is the complete breakdown in 60 seconds!

📊 Key IPO Highlights:
• Issue Size: ₹[Amount] Cr
• Price Band: ₹[Range]
• Lot Size: [Shares] shares (Min Investment: ₹[Amount])

📈 Financial Health:
• Revenue Growth: ₹[X] Cr ➔ ₹[Y] Cr
• Net Profit (PAT): ₹[Z] Cr

💡 Analyst Verdict:
[Apply with caution / Avoid / High risk - short 1 sentence summary]

💬 Will you apply for this IPO or skip? Comment 'APPLY' or 'SKIP' below! 👇
🔖 Save this reel to check listing day gains!

⚠️ Disclaimer: For educational purposes only. Not investment or financial advice. Consult a SEBI registered advisor before investing.

.
.
#IPO #IPOAlert #[Brand]IPO #StockMarketIndia #ShareMarket #Nifty50 #Sensex #Investment #StockMarketNews #Trading #IndianStockMarket #FinanceTips #ReelsIndia #ReelsViral
```

---

## 5. State Management & Tracker Isolation

To ensure that a temporary glitch on one platform does not block the other, we maintain independent trackers:

```text
data/
├── uploaded_youtube.json     <-- Tracks YouTube Video IDs, Titles, and Published URLs
└── uploaded_instagram.json   <-- Tracks Instagram Media IDs, Permalinks, and Post Timestamps
```

### Safety Logic:
- If a video is published to YouTube but Instagram fails:
  - YouTube tracker saves the upload.
  - The folder on Google Drive is **NOT** moved to `Uploaded/` yet.
  - On the next run, the pipeline detects that YouTube is already done, skips YouTube, and only attempts the pending Instagram upload.
- Once **both** trackers confirm completion, the Drive folder is archived to `Uploaded/`.

---

## 6. One-Time Meta Developer Account Setup

To enable GitHub Actions to post on your behalf, complete these one-time steps:

### Step 1: Switch Instagram to Professional
1. Open Instagram on your phone: `Settings` ➔ `Account type and tools` ➔ `Switch to Professional Account` (Choose **Creator** or **Business**).
2. Connect your Instagram account to a **Facebook Page** (Settings ➔ Linked Accounts ➔ Facebook Page). Create a blank page if you do not have one.

### Step 2: Create a Meta Developer App
1. Visit [developers.facebook.com](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** ➔ **Create App** ➔ Select **Other** ➔ Select **Business**.
3. Under Add Products, add **Instagram Graph API**.

### Step 3: Generate Never-Expiring System User Token
1. In Meta Business Suite (`business.facebook.com`):
   - Go to **Business Settings** ➔ **System Users** ➔ Click **Add**.
   - Role: **Admin**.
2. Click **Generate Token**:
   - Select your App.
   - Token Expiration: **Never**.
   - Check Permissions:
     - `instagram_basic`
     - `instagram_content_publish`
     - `pages_show_list`
     - `pages_read_engagement`
3. Copy the generated token (`INSTAGRAM_ACCESS_TOKEN`).

### Step 4: Get your Instagram Business Account ID
Run a quick query via Graph API Explorer or curl:
```bash
https://graph.facebook.com/v21.0/me/accounts?access_token=YOUR_TOKEN
```
It returns your Page ID and connected Instagram Account ID (`INSTAGRAM_ACCOUNT_ID`).

---

## 7. GitHub Actions Workflow Configuration

Update the existing `.github/workflows/youtube_publisher.yml` (or rename to `publisher.yml`) to support both platforms seamlessly:

```yaml
name: Scheduled IPO Multi-Platform Publisher (YouTube & Instagram)

on:
  schedule:
    # 09:30 AM IST (04:00 UTC) & 07:30 PM IST (14:00 UTC) Every Day
    - cron: '0 4 * * *'
    - cron: '0 14 * * *'
  workflow_dispatch:
    inputs:
      publish_youtube:
        description: 'Publish to YouTube (true/false)'
        required: false
        default: 'true'
      publish_instagram:
        description: 'Publish to Instagram Reels (true/false)'
        required: false
        default: 'true'

permissions:
  contents: write

concurrency:
  group: multi-platform-publisher
  cancel-in-progress: false

jobs:
  publish-videos:
    name: Sync Drive, Generate SEO & Publish
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install NPM Dependencies
        run: npm ci

      - name: Run Multi-Platform Auto-Publisher Pipeline
        env:
          # Google Drive Ingestion
          GDRIVE_REFRESH_TOKEN: ${{ secrets.GDRIVE_REFRESH_TOKEN }}
          GDRIVE_CLIENT_ID: ${{ secrets.GDRIVE_CLIENT_ID }}
          GDRIVE_CLIENT_SECRET: ${{ secrets.GDRIVE_CLIENT_SECRET }}
          GDRIVE_PARENT_FOLDER_ID: ${{ secrets.GDRIVE_PARENT_FOLDER_ID }}

          # YouTube Data API
          YOUTUBE_CLIENT_ID: ${{ secrets.YOUTUBE_CLIENT_ID }}
          YOUTUBE_CLIENT_SECRET: ${{ secrets.YOUTUBE_CLIENT_SECRET }}
          YOUTUBE_REFRESH_TOKEN: ${{ secrets.YOUTUBE_REFRESH_TOKEN }}
          YOUTUBE_AUTO_SCHEDULE: 'true'

          # Instagram Graph API
          INSTAGRAM_ACCOUNT_ID: ${{ secrets.INSTAGRAM_ACCOUNT_ID }}
          INSTAGRAM_ACCESS_TOKEN: ${{ secrets.INSTAGRAM_ACCESS_TOKEN }}
          ENABLE_INSTAGRAM: ${{ github.event.inputs.publish_instagram || 'true' }}
          ENABLE_YOUTUBE: ${{ github.event.inputs.publish_youtube || 'true' }}

          # AI Metadata Engine (Groq)
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          GROQ_MODEL: ${{ vars.GROQ_MODEL || 'qwen/qwen3.8-27b' }}
        run: npm run publish

      - name: Commit & Push Updated Trackers
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          git add data/uploaded_youtube.json data/uploaded_instagram.json
          if git diff --staged --quiet; then
            echo "✨ Trackers are up-to-date. No commit needed."
          else
            git commit -m "chore: update YouTube and Instagram upload trackers [skip ci]"
            git pull --rebase origin main
            git push origin main
            echo "✅ Trackers committed and pushed to main."
          fi
```

---

## 8. Implementation Checklist

- [ ] **Create `scripts/publish_instagram.ts`**:
  - Implements container creation, binary streaming to `rupload.facebook.com`, status polling, and publication.
- [ ] **Add `generateInstagramCaption` in `scripts/generate_metadata.ts`**:
  - Groq AI prompt tuned specifically for Instagram Reels (emojis, formatting, line breaks, 20-25 targeted hashtags, engagement callout).
- [ ] **Add `data/uploaded_instagram.json` tracker logic in `scripts/tracker.ts`**:
  - `isIPOAlreadyOnInstagram()` and `recordInstagramUpload()`.
- [ ] **Update `scripts/pipeline.ts`**:
  - Add parallel/sequential publishing to YouTube and Instagram.
  - Archive Google Drive folder only when both target platforms succeed.
- [ ] **Create `scripts/test_instagram.ts`**:
  - Quick sanity script to verify token validity, fetch Instagram profile details, and test container readiness before running the full pipeline.
- [ ] **Add GitHub Secrets**:
  - `INSTAGRAM_ACCOUNT_ID`
  - `INSTAGRAM_ACCESS_TOKEN`
