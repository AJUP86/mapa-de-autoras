// email.ts — Stage 8.5
//
// Strings + rendering for the submit_suggestion acknowledgement email —
// the "I got your suggestion" note sent the moment a submission lands
// (distinct from notify_submitter, which fires later when a book is added).
// Kept inline in the function bundle because Edge Functions can't import
// src/i18n/*.json (different Deno bundle scope).

const STRINGS = {
  es: {
    subject: "Recibí tu sugerencia",
    greetingWith: (name: string) => `Hola, ${name},`,
    greetingBare: "Hola,",
    intro: "Gracias por tu sugerencia. Recibí esto:",
    outro: "Reviso cada libro; si lo añado al mapa, te aviso.",
    ctaLabel: "Ver el mapa",
    signature: "Danny",
  },
  en: {
    subject: "I got your suggestion",
    greetingWith: (name: string) => `Hi ${name},`,
    greetingBare: "Hi,",
    intro: "Thanks for your suggestion. I received:",
    outro: "I review each book; if I add it to the map, I'll let you know.",
    ctaLabel: "See the map",
    signature: "Danny",
  },
} as const;

export interface AckInput {
  locale: "es" | "en";
  submitterName: string | null;
  bookTitles: string[];
  siteUrl: string;
}

export interface RenderOutput {
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

export function renderSubmitAck(input: AckInput): RenderOutput {
  const s = STRINGS[input.locale];
  const greeting = input.submitterName ? s.greetingWith(input.submitterName) : s.greetingBare;
  const titles = input.bookTitles;

  const textBody = [
    greeting,
    "",
    `${s.intro} ${titles.join(", ")}.`,
    "",
    s.outro,
    "",
    `${s.ctaLabel}: ${input.siteUrl}`,
    "",
    s.signature,
  ].join("\n");

  const listItems = titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  const htmlBody =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(s.intro)}</p>` +
    `<ul>${listItems}</ul>` +
    `<p>${escapeHtml(s.outro)}</p>` +
    `<p><a href="${escapeHtml(input.siteUrl)}">${escapeHtml(s.ctaLabel)}</a></p>` +
    `<p>${escapeHtml(s.signature)}</p>`;

  return { subject: s.subject, textBody, htmlBody };
}
