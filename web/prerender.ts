// Build step: static HTML for the public pages, for search engines and AI answer
// engines that don't run JavaScript. Each page gets its own <head> (title,
// description, canonical, social tags) and its real text in #prerender, which the
// app hides before first paint (see index.html), so people only ever see the app.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const ORIGIN = "https://app.frameseek.in";

interface LegalDocument {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Load src/lib/legal.ts so the static pages use exactly the text the app shows. */
async function loadLegal(root: string) {
  const out = await build({
    entryPoints: [path.join(root, "src/lib/legal.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const code = out.outputFiles[0].text;
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)) as {
    TERMS_OF_SERVICE: LegalDocument;
    PRIVACY_POLICY: LegalDocument;
  };
}

const footer = `<footer><nav aria-label="Legal"><a href="/">Sign in</a> · <a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a></nav></footer>`;

// Mirrors the sign-in page (pages/Login.tsx), which is what "/" shows visitors.
const home = `<main>
<p>FOR THE MOMENTS WORTH FINDING</p>
<h1>Your content. A world of possibilities.</h1>
<p>Find the frame. Follow the feeling. Make something worth watching.</p>
<h2>Welcome to your next great story.</h2>
<p>Sign in to bring your content into focus.</p>
<p><a href="/api/v1/auth/google/start">Continue with Google</a></p>
<p>Your videos and workspace stay private to you.</p>
<p>New here? You’ll be asked to accept our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a> before you start.</p>
</main>
${footer}`;

function legalBody(doc: LegalDocument) {
  const sections = doc.sections
    .map((s) => `<section><h2>${esc(s.heading)}</h2>${s.body.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`)
    .join("\n");
  return `<main><article>
<h1>${esc(doc.title)}</h1>
<p>Last updated ${esc(doc.lastUpdated)}</p>
<p>${esc(doc.intro)}</p>
${sections}
</article></main>
${footer}`;
}

interface Page {
  file: string;
  path: string;
  canonical: string;
  title: string;
  description: string;
  body: string;
}

function renderPage(shell: string, page: Page) {
  const url = `${ORIGIN}${page.canonical}`;
  const head = `<title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="FrameSeek" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />`;
  const withHead = shell.replace(
    /<!-- seo:start[^>]*-->[\s\S]*?<!-- seo:end -->/,
    `<!-- seo:start -->\n    ${head}\n    <!-- seo:end -->`,
  );
  if (withHead === shell) throw new Error("prerender: seo markers missing from index.html");
  return withHead.replace(
    '<div id="prerender"></div>',
    `<div id="prerender">\n${page.body}\n</div>`,
  );
}

export default function prerender(): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  return {
    name: "frameseek-prerender",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const { TERMS_OF_SERVICE, PRIVACY_POLICY } = await loadLegal(root);
      const shell = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      const pages: Page[] = [
        {
          file: "index.html",
          path: "/",
          canonical: "/",
          title: "FrameSeek | AI video search: find any moment in your videos",
          description:
            "FrameSeek is AI video search. Upload your videos, describe a moment in plain words, and jump straight to it. Browse shots, read transcripts and export clips.",
          body: home,
        },
        {
          // Same page as "/" for visitors; canonical points there.
          file: "login.html",
          path: "/login",
          canonical: "/",
          title: "Sign in | FrameSeek",
          description:
            "Sign in to FrameSeek with Google to search your videos by describing any moment, browse shots and export clips.",
          body: home,
        },
        {
          file: "terms.html",
          path: "/terms",
          canonical: "/terms",
          title: "Terms of Service | FrameSeek",
          description: `The terms for using FrameSeek, the AI video search app: your content, acceptable use, plans and limits, and payments. Last updated ${TERMS_OF_SERVICE.lastUpdated}.`,
          body: legalBody(TERMS_OF_SERVICE),
        },
        {
          file: "privacy.html",
          path: "/privacy",
          canonical: "/privacy",
          title: "Privacy Policy | FrameSeek",
          description: `What FrameSeek collects, why, who processes it, how long it's kept and your rights. Last updated ${PRIVACY_POLICY.lastUpdated}.`,
          body: legalBody(PRIVACY_POLICY),
        },
      ];
      for (const page of pages) {
        fs.writeFileSync(path.join(outDir, page.file), renderPage(shell, page));
      }

      const today = new Date().toISOString().slice(0, 10);
      const urls = ["/", "/terms", "/privacy"]
        .map((p) => `  <url><loc>${ORIGIN}${p}</loc><lastmod>${today}</lastmod></url>`)
        .join("\n");
      fs.writeFileSync(
        path.join(outDir, "sitemap.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      );
    },
  };
}
