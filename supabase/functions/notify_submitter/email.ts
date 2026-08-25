// email.ts — Stage 8.5
//
// Strings + rendering for the notify_submitter transactional email.
// Kept inline in the function bundle because Edge Functions can't import
// src/i18n/*.json (different Deno bundle scope).
//
// OWNER TO REVIEW COPY TONE: the strings below are written in Danny's
// first-person voice. Confirm wording before shipping.

const STRINGS = {
  es: {
    subject: "He revisado tu sugerencia",
    greetingWith: (name: string) => `Hola, ${name},`,
    greetingBare: "Hola,",
    intro: "He revisado los libros que sugeriste:",
    line: {
      promoted: (title: string, author: string) => `«${title}» de ${author} ya está en el mapa.`,
      already_present: (title: string) => `«${title}» ya estaba en el mapa.`,
      rejected: (title: string) => `«${title}» — esta vez no lo he añadido.`,
    },
    ctaLabel: "Ver el mapa",
    signature: "Danny",
  },
  en: {
    subject: "I've reviewed your suggestion",
    greetingWith: (name: string) => `Hi ${name},`,
    greetingBare: "Hi,",
    intro: "I went through the books you suggested:",
    line: {
      promoted: (title: string, author: string) => `"${title}" by ${author} is now on the map.`,
      already_present: (title: string) => `"${title}" was already on the map.`,
      rejected: (title: string) => `"${title}" — I didn't add this one this time.`,
    },
    ctaLabel: "See the map",
    signature: "Danny",
  },
} as const;

export interface OutcomeEntry {
  title: string;
  author: string;
  disposition: "promoted" | "already_present" | "rejected";
}

export interface OutcomeInput {
  locale: "es" | "en";
  submitterName: string | null;
  siteUrl: string;
  entries: OutcomeEntry[];
}

export interface OutcomeOutput {
  subject: string;
  textBody: string;
  htmlBody: string;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderOutcome(input: OutcomeInput): OutcomeOutput {
  const s = STRINGS[input.locale];
  const greeting = input.submitterName ? s.greetingWith(input.submitterName) : s.greetingBare;

  const line = (e: OutcomeEntry): string => {
    switch (e.disposition) {
      case "promoted":
        return s.line.promoted(e.title, e.author);
      case "already_present":
        return s.line.already_present(e.title);
      case "rejected":
        return s.line.rejected(e.title);
    }
  };

  const textBody = [
    greeting,
    "",
    s.intro,
    "",
    ...input.entries.map((e) => "- " + line(e)),
    "",
    `${s.ctaLabel}: ${input.siteUrl}`,
    "",
    s.signature,
  ].join("\n");

  const htmlBody =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(s.intro)}</p>` +
    `<ul>${input.entries.map((e) => `<li>${escapeHtml(line(e))}</li>`).join("")}</ul>` +
    `<p><a href="${escapeHtml(input.siteUrl)}">${escapeHtml(s.ctaLabel)}</a></p>` +
    `<p>${escapeHtml(s.signature)}</p>`;

  return { subject: s.subject, textBody, htmlBody };
}
