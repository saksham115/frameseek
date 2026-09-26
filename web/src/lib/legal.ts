// Terms of Service and Privacy Policy shown at first sign-in and on /terms and /privacy.
// Keep these in step with what the product actually does (processors, limits, deletion).

export interface LegalDocument {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

export const LEGAL_EFFECTIVE_DATE = "September 26, 2026";
export const PRIVACY_CONTACT = "privacy@frameseek.com";

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: LEGAL_EFFECTIVE_DATE,
  intro:
    "These terms govern your use of FrameSeek. By accepting them you agree to use the service as described here.",
  sections: [
    {
      heading: "1. The service",
      body: [
        "FrameSeek lets you upload videos, index their frames and spoken audio, search them in natural language, and export clips. We process your videos with automated systems to provide these features.",
      ],
    },
    {
      heading: "2. Your account",
      body: [
        "You sign in with your Google account. You are responsible for activity under your account and for keeping access to your Google account secure.",
        "You can delete your account at any time from Settings.",
      ],
    },
    {
      heading: "3. Your content",
      body: [
        "You keep ownership of the videos you upload and the clips you export. You give us a limited licence to store, process and analyse your content only to provide FrameSeek to you.",
        "You must have the right to upload and process everything you submit.",
      ],
    },
    {
      heading: "4. Acceptable use",
      body: [
        "Do not use FrameSeek to upload content that is illegal, infringes someone else’s rights, or exploits or harms others; to access other people’s data or our systems without permission; or to disrupt the service.",
        "We may remove content or suspend accounts that break these rules.",
      ],
    },
    {
      heading: "5. Plans, limits and retention",
      body: [
        "Each plan has storage and monthly search limits. The Free plan includes 5 GB of storage and 50 visual searches a month. If you run out, you can request 10 more, up to three times a month. Paid plan limits are shown on the Plans page.",
        "Videos may be deleted automatically after your plan’s retention period: 15 days after upload on the Free plan and 90 days on paid plans. Keep your own copy of anything you need.",
        "We may change limits with reasonable notice.",
      ],
    },
    {
      heading: "6. Payments",
      body: [
        "Paid plans are billed through Stripe as subscriptions and renew until you cancel. You can manage or cancel billing from Settings.",
      ],
    },
    {
      heading: "7. Availability and liability",
      body: [
        "FrameSeek is provided “as is”. Search results come from automated analysis and may be incomplete or inaccurate.",
        "To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to what you paid us in the 12 months before the claim.",
      ],
    },
    {
      heading: "8. Ending the service",
      body: [
        "You may stop using FrameSeek and delete your account at any time. We may suspend or end accounts that break these terms.",
      ],
    },
    {
      heading: "9. Changes",
      body: [
        "We may update these terms. For significant changes we will tell you in the app, and we may ask you to accept the new version before continuing.",
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: LEGAL_EFFECTIVE_DATE,
  intro:
    "This policy explains what FrameSeek collects, why, who processes it, and the choices you have.",
  sections: [
    {
      heading: "1. What we collect",
      body: [
        "Account: your name, email address and Google account identifier from Google sign-in.",
        "Content: the videos you upload and what we derive from them: sampled frames and thumbnails, image embeddings (numeric fingerprints used for search), audio transcripts, and the clips you export.",
        "Activity: your searches and search history, folders, sign-in times, and basic usage needed to enforce plan limits.",
        "Feedback: messages you send through the in-app feedback box, with the page you were on and your browser type.",
        "Billing: if you subscribe, Stripe processes your payment details. We store your Stripe customer ID and subscription status, never your card number.",
      ],
    },
    {
      heading: "2. How we use it",
      body: [
        "To run FrameSeek for you: storing and indexing your videos, answering your searches, transcribing audio, exporting clips, enforcing plan limits, keeping the service secure, and fixing problems.",
        "We do not sell your data, use it for advertising, or use your videos to train AI models.",
      ],
    },
    {
      heading: "3. Who processes it",
      body: [
        "Microsoft Azure hosts FrameSeek, its database and file storage. Azure AI Vision creates the image embeddings for search, and Azure OpenAI transcribes audio. Azure Application Insights records errors and performance for monitoring.",
        "Google provides sign-in. Stripe handles payments if you subscribe.",
        "These providers process data on our behalf under their own security and privacy commitments.",
      ],
    },
    {
      heading: "4. Who can see your content",
      body: [
        "Your library is private to your account. Other users cannot see or search your videos. Media is served through short-lived, signed links.",
      ],
    },
    {
      heading: "5. Cookies and local storage",
      body: [
        "We use essential cookies to keep you signed in. Your browser also stores small preferences, such as light or dark theme and library view. We do not use advertising or cross-site tracking cookies.",
      ],
    },
    {
      heading: "6. Retention and deletion",
      body: [
        "We keep your content while your account is active, subject to your plan’s retention period.",
        "When you delete your account, we delete your videos, frames, embeddings, transcripts, clips, folders and search history. We keep a deactivated account record and a deletion record (your email, any reason you gave, and summary usage figures) to handle support and prevent abuse. Feedback you sent is kept to improve FrameSeek but is no longer linked to your account. Backups and logs may keep data for a limited time before they expire.",
      ],
    },
    {
      heading: "7. Your rights",
      body: [
        "You can access and delete your content in the app and delete your account from Settings. Depending on where you live, you may also have rights to correct, export or restrict the use of your data, or to object to processing.",
        `To make a request, email ${PRIVACY_CONTACT}.`,
      ],
    },
    {
      heading: "8. Changes and contact",
      body: [
        "We will tell you in the app about significant changes to this policy.",
        `Questions: ${PRIVACY_CONTACT}.`,
      ],
    },
  ],
};
