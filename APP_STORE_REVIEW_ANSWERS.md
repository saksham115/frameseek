# App Store Review Responses

## 1. Screen Recording

A screen recording captured on a physical device will be provided, demonstrating the following flows:

- App launch and Google Sign-In authentication
- Terms of Service acceptance on first login
- Uploading a video from the photo library
- Video processing status (frame extraction and AI embedding generation)
- Searching videos with a natural language query (e.g., "person holding a red cup")
- Viewing search results with matching frames and exact timestamps
- Creating a clip from a search result
- Subscription paywall with plan comparison and purchasing flow
- Restore Purchases functionality
- Settings screen: Sign Out and Delete Account flows
- Permission prompts for photo library access during video upload

---

## 2. App Purpose

FrameSeek is an AI-powered video search app that makes every moment in your videos instantly findable through natural language.

Users upload videos, which are automatically processed — frames are extracted at configurable intervals and converted into high-dimensional semantic embeddings using AI. Users can then search their entire video library by describing what they're looking for in plain English (e.g., "sunset on the beach", "person holding a red cup"), and FrameSeek returns matching frames with exact timestamps they can jump to.

**Problem it solves:** Scrubbing through hours of video to find a specific moment is time-consuming and frustrating. FrameSeek eliminates this by enabling instant, natural language search across an entire video library.

**Value it provides:** Content creators, researchers, journalists, and anyone with large video libraries can find exact moments in seconds instead of minutes or hours. Users can also generate clips directly from search results for easy sharing and export.

---

## 3. Test Credentials & Instructions

**Authentication:** The app supports Sign in with Apple, Google Sign-In, and a Demo Login for review purposes.

**Recommended method for App Review — Demo Login (no third-party auth required):**

1. Launch the app
2. Tap **"Demo Login"** at the bottom of the login screen
3. This signs in automatically with the demo account — no external authentication, no verification codes

**Alternative — Sign in with Apple:**

1. Launch the app and tap **"Sign in with Apple"**
2. Authenticate with any Apple ID

**Alternative — Google Sign-In:**

- **Test Email:** saksham115test@gmail.com
- **Test Password:** testing@1850

**Instructions to access main features after signing in:**

1. Accept the Terms of Service on first login
4. **Upload a video:** Tap the upload button on the Home screen, select a video from the photo library (the app will request photo library access)
5. **Wait for processing:** The video will show processing status as frames are extracted and AI embeddings are generated (typically 1-2 minutes for a short video)
6. **Search:** Once processed, use the search bar to type a natural language description (e.g., "person walking", "blue sky"). Results show matching frames with timestamps
7. **Create a clip:** Tap on a search result and use the clip creation feature to generate a clip with a start and end time
8. **Subscriptions:** Navigate to Settings > Plan to view the paywall with Free, Pro ($6.99/mo), and Pro Max ($14.99/mo) plans
9. **Account deletion:** Navigate to Settings > scroll to bottom > "Delete Account" — confirms with an alert before permanently deleting the account and all associated data
10. **Sign out:** Settings > "Sign Out"

---

## 4. External Services

| Service | Purpose |
|---------|---------|
| **Sign in with Apple** | User authentication — primary login option per App Store guidelines |
| **Google OAuth 2.0** | User authentication — alternative login via Google Sign-In |
| **Google Vertex AI (Multimodal Embeddings)** | Converts extracted video frames into 1408-dimensional semantic vectors for natural language search |
| **Google Cloud Storage** | Stores uploaded videos, extracted frames, thumbnails, and generated clips |
| **OpenAI Whisper** | Automatic speech recognition — generates video transcripts for enhanced search |
| **Qdrant** | Self-hosted vector database for storing and querying frame embeddings |
| **Apple StoreKit / In-App Purchase v2** | Subscription management, receipt validation, and Apple Server Notifications v2 for renewal/cancellation events |
| **PostgreSQL** | Primary database for user accounts, video metadata, subscriptions, and search history |
| **Redis** | Background job queue for asynchronous video processing tasks |

---

## 5. Regional Differences

FrameSeek functions consistently across all regions. There are no regional differences in features, content, pricing tiers, or functionality. All users worldwide have access to the same features regardless of their location.

---

## 6. Regulated Industry

FrameSeek does not operate in a highly regulated industry. The app is a general-purpose video search tool and does not provide services in healthcare, finance, gambling, legal, or any other regulated sector. No special documentation or credentials are required.

---

## 7. Guideline 2.1(b) — Business Model

**1. Who are the users that will use the paid services in the app?**

All users of FrameSeek can access paid subscription tiers. Our users are content creators, researchers, journalists, and individuals with large video libraries who need advanced video search capabilities. Any user can upgrade from the free tier to a paid plan for increased storage, more monthly searches, and longer video retention.

**2. Where can users purchase the services that can be accessed in the app?**

All paid subscriptions are purchased exclusively through Apple In-App Purchase (StoreKit 2) within the app. There is no external purchase mechanism — the App Store is the sole point of sale.

**3. What specific types of previously purchased services can a user access in the app?**

Users who have previously purchased a subscription (Pro or Pro Max) can access:
- **Pro ($6.99/month or $55.99/year):** 20 GB storage, 100 searches/month, 90-day video retention
- **Pro Max ($14.99/month or $119.99/year):** 50 GB storage, 500 searches/month, 90-day video retention

The app includes a "Restore Purchases" button (Settings > Plan) that restores any previously purchased subscriptions via Apple's StoreKit API.

**4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?**

None. All paid features are unlocked exclusively through Apple In-App Purchase. There are no external payment methods, no web-based subscriptions, and no way to bypass IAP. The free tier (5 GB storage, 20 searches/month, 15-day retention) is available to all users without any purchase.

---

## 8. Guideline 4.8 — Sign in with Apple

The app now offers **Sign in with Apple** as the primary login option on the login screen. It meets all requirements:

- **Limits data collection** to the user's name and email address only
- **Allows users to keep their email private** via Apple's private email relay
- **Does not collect interactions for advertising** — FrameSeek has no advertising and does not share user data with any advertising services

Sign in with Apple is displayed prominently above Google Sign-In on the login screen.
