import type { LegalDocument } from "@/lib/legal";

/** Renders a Terms / Privacy document from lib/legal. */
export default function LegalText({
  doc,
  headingLevel = 2,
}: {
  doc: LegalDocument;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="legal-text">
      <p className="legal-updated">Last updated {doc.lastUpdated}</p>
      <p className="legal-intro">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <H>{s.heading}</H>
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
