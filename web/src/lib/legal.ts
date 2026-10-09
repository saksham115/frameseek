// Terms of Service and Privacy Policy shown at first sign-in and on /terms and /privacy.
// Keep these in step with what the product actually does (processors, limits, deletion).
// Changing LEGAL_EFFECTIVE_DATE asks everyone to accept again only if the backend's
// TERMS_EFFECTIVE_AT (backend/app/legal.py) moves with it.

export interface LegalDocument {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

export const LEGAL_EFFECTIVE_DATE = "October 8, 2026";
export const PRIVACY_CONTACT = "privacy@frameseek.in";
export const MINIMUM_AGE = 16;

// The data controller. The postal address is required in the Privacy Policy.
export const CONTROLLER_NAME = "Keplora Tech";
export const CONTROLLER_ADDRESS = "";
// Our representative in the EU (GDPR Art. 27), once one is appointed: name and address.
export const EU_REPRESENTATIVE = "";

const controller = CONTROLLER_ADDRESS
  ? `${CONTROLLER_NAME}, ${CONTROLLER_ADDRESS}`
  : CONTROLLER_NAME;

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: LEGAL_EFFECTIVE_DATE,
  intro: `These terms govern your use of FrameSeek, which is provided by ${CONTROLLER_NAME}. By accepting them you agree to use the service as described here.`,
  sections: [
    {
      heading: "1. The service",
      body: [
        "FrameSeek lets you upload videos, index their frames and spoken audio, search them in natural language, and export clips. We process your videos with automated systems to provide these features.",
      ],
    },
    {
      heading: "2. Who can use FrameSeek",
      body: [
        `You must be at least ${MINIMUM_AGE} years old to use FrameSeek. If you are under 18, you need permission from a parent or guardian, who accepts these terms on your behalf.`,
      ],
    },
    {
      heading: "3. Your account",
      body: [
        "You sign in with your Google account. You are responsible for activity under your account and for keeping access to your Google account secure.",
        "You can delete your account at any time from Settings.",
      ],
    },
    {
      heading: "4. Your content",
      body: [
        "You keep ownership of the videos you upload and the clips you export. You give us a limited licence to store, process and analyse your content only to provide FrameSeek to you.",
        "You must have the right to upload and process everything you submit, including the consent of people who appear in your videos where the law requires it.",
      ],
    },
    {
      heading: "5. Acceptable use",
      body: [
        "Do not use FrameSeek to upload content that is illegal, infringes someone else’s rights, or exploits or harms others; to access other people’s data or our systems without permission; or to disrupt the service.",
        "We may remove content or suspend accounts that break these rules.",
      ],
    },
    {
      heading: "6. Plans, limits and retention",
      body: [
        "Each plan has storage and monthly search limits. The Free plan includes 5 GB of storage and 50 visual searches a month. If you run out, you can request 10 more, up to three times a month. Paid plan limits are shown on the Plans page.",
        `Videos are deleted automatically when your plan’s retention period ends: 15 days after upload on the Free plan and 90 days on paid plans. Videos uploaded before ${LEGAL_EFFECTIVE_DATE} get the full period counted from that date. Keep your own copy of anything you need.`,
        "We may change limits with reasonable notice.",
      ],
    },
    {
      heading: "7. Payments",
      body: [
        "Paid plans are billed through Stripe as subscriptions and renew until you cancel. You can manage or cancel billing from Settings.",
      ],
    },
    {
      heading: "8. Availability and liability",
      body: [
        "FrameSeek is provided “as is”. Search results come from automated analysis and may be incomplete or inaccurate.",
        "To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits rights you have as a consumer that cannot be limited by contract.",
      ],
    },
    {
      heading: "9. Ending the service",
      body: [
        "You may stop using FrameSeek and delete your account at any time. We may suspend or end accounts that break these terms.",
      ],
    },
    {
      heading: "10. Changes",
      body: [
        "We may update these terms. For significant changes we will tell you in the app, and we may ask you to accept the new version before continuing.",
      ],
    },
    {
      heading: "11. Contact",
      body: [`Questions about these terms: ${PRIVACY_CONTACT}.`],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: LEGAL_EFFECTIVE_DATE,
  intro:
    "This policy explains what FrameSeek collects, why, where it is processed, how long we keep it, and the rights you have.",
  sections: [
    {
      heading: "1. Who we are",
      body: [
        `FrameSeek is run by ${controller}, which is the controller of your personal data. For anything about your data, email ${PRIVACY_CONTACT}. This address also handles grievances under India’s data protection law.`,
        ...(EU_REPRESENTATIVE
          ? [`Our representative in the European Union is ${EU_REPRESENTATIVE}.`]
          : []),
      ],
    },
    {
      heading: "2. What we collect",
      body: [
        "Account: your name, email address and Google account identifier from Google sign-in.",
        "Content: the videos you upload and what we derive from them: sampled frames and thumbnails, image embeddings (numeric fingerprints used for search), audio transcripts, and the clips you export. If you make creations, we store their settings, the logos and music you upload for them, and the videos we render.",
        "Activity: your searches and search history, folders, sign-in times, the days you use FrameSeek, and basic usage needed to enforce plan limits. We also record your approximate country, worked out from your IP address when you open the app (we don’t store the IP address), and your browser’s time zone.",
        "Feedback: messages you send through the in-app feedback box, with the page you were on and your browser type.",
        "Billing: if you subscribe, Stripe processes your payment details. We store your Stripe customer ID and subscription status, never your card number.",
      ],
    },
    {
      heading: "3. Why we use it, and on what legal basis",
      body: [
        "To provide FrameSeek under our contract with you: your account, storing and indexing your videos, transcribing audio, answering your searches, exporting clips and creations, enforcing plan limits, and billing.",
        "For our legitimate interests in running a secure, reliable service: preventing abuse, keeping FrameSeek secure, fixing problems, aggregate usage statistics (such as how many people use FrameSeek in each country), improving FrameSeek from your feedback, and keeping a short record of deleted accounts. You can object to these uses; see section 9.",
        "To meet legal obligations, such as keeping billing records for tax.",
        "We do not sell your data, use it for advertising, or use your videos to train AI models. We make no automated decisions that have legal or similarly significant effects on you.",
      ],
    },
    {
      heading: "4. Who processes it",
      body: [
        "Microsoft Azure hosts FrameSeek, its database and file storage. Azure AI Vision creates the image embeddings for search, and Azure OpenAI transcribes audio. Azure Application Insights records errors and performance for monitoring.",
        "Google provides sign-in. Stripe handles payments if you subscribe.",
        "These providers act on our behalf under data processing agreements and may not use your data for their own purposes.",
      ],
    },
    {
      heading: "5. Where your data is processed",
      body: [
        "FrameSeek is run from India. Your account and content are stored in Microsoft Azure data centres in India, and audio is transcribed in India.",
        "To build the search index, frames from your videos are sent to Azure AI Vision in the United States, which returns the embeddings. Stripe and Google may process data in the United States and other countries.",
        "If you are in the European Economic Area, the UK or Switzerland, this means your data leaves your region. India does not have an adequacy decision from the European Commission. Where our providers move data out of your region, they do so under the European Commission’s Standard Contractual Clauses (and, for Microsoft and Stripe, the EU-US Data Privacy Framework). You can ask us for a copy of these safeguards.",
      ],
    },
    {
      heading: "6. Who can see your content",
      body: [
        "Your library is private to your account. Other users cannot see or search your videos. Media is served through short-lived, signed links. Data is encrypted in transit and at rest, and our database is on a private network.",
      ],
    },
    {
      heading: "7. Cookies and local storage",
      body: [
        "We use essential cookies to keep you signed in. Your browser also stores small preferences, such as light or dark theme and library view. We do not use advertising, analytics or cross-site tracking cookies, and our fonts and other files are served from our own servers.",
      ],
    },
    {
      heading: "8. How long we keep it",
      body: [
        "Account details, search history and folders: while your account is open.",
        "Videos and everything derived from them: until you delete them, or until your plan’s retention period ends (15 days after upload on the Free plan, 90 days on paid plans), whichever comes first. Clips are deleted with the video they come from. Creations: until you delete them or your account.",
        "When you delete your account, we delete your videos, frames, embeddings, transcripts, clips, creations, folders and search history straight away. We keep your name and email on a deactivated record for 30 days, to answer support requests and prevent abuse, and so signing back in restores your (empty) account. After 30 days we remove your name, email and sign-in identifiers, and keep only anonymous usage figures and any reason you gave for leaving.",
        "Feedback: kept to improve FrameSeek; when you delete your account it is no longer linked to you. Monitoring logs: 30 days. Database backups: 14 days. Billing records: as long as tax law requires.",
      ],
    },
    {
      heading: "9. Your rights",
      body: [
        "You can see and delete your content in the app, and delete your account from Settings.",
        `You also have the right to access a copy of your data, to correct it, to have it erased, to restrict or object to how we use it, and to receive it in a portable format. To use these rights, email ${PRIVACY_CONTACT} from the address on your account. We reply within one month and may need to confirm it is you.`,
        "If you are unhappy with how we handle your data, you can complain to the data protection authority where you live or work (in the EU, your national supervisory authority; in India, the Data Protection Board of India). We would appreciate the chance to sort it out with you first.",
      ],
    },
    {
      heading: "10. Children",
      body: [
        `FrameSeek is not meant for anyone under ${MINIMUM_AGE}. If you believe a child under ${MINIMUM_AGE} has an account, contact us and we will delete it.`,
      ],
    },
    {
      heading: "11. Changes and contact",
      body: [
        "We will tell you in the app about significant changes to this policy.",
        `Questions: ${PRIVACY_CONTACT}.`,
      ],
    },
  ],
};
