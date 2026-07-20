// email.ts — Stage 8
//
// Strings + rendering for the notify_submitter transactional email.
// Kept inline in the function bundle because Edge Functions can't import
// src/i18n/*.json (different Deno bundle scope).

const STRINGS = {
  es: {
    subject:      "Tu sugerencia está en el mapa",
    greetingWith: (name: string) => `Hola, ${name},`,
    greetingBare: "Hola,",
    body:         (authorName: string) =>
      `Acabo de añadir a ${authorName} al mapa de autoras — gracias por la sugerencia.`,
    ctaLabel:     "Ver el mapa",
    signature:    "Danny",
  },
  en: {
    subject:      "Your suggestion is on the map",
    greetingWith: (name: string) => `Hi ${name},`,
    greetingBare: "Hi,",
    body:         (authorName: string) =>
      `I just added ${authorName} to the map — thanks for the suggestion.`,
    ctaLabel:     "See the map",
    signature:    "Danny",
  },
} as const;

export interface RenderInput {
  locale: "es" | "en";
  authorName: string;
  submitterName: string | null;
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

export function renderEmail(input: RenderInput): RenderOutput {
  const s = STRINGS[input.locale];
  const greeting = input.submitterName
    ? s.greetingWith(input.submitterName)
    : s.greetingBare;
  const bodyLine = s.body(input.authorName);

  const textBody = [
    greeting,
    "",
    bodyLine,
    "",
    `${s.ctaLabel}: ${input.siteUrl}`,
    "",
    s.signature,
  ].join("\n");

  const htmlBody =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(bodyLine)}</p>` +
    `<p><a href="${escapeHtml(input.siteUrl)}">${escapeHtml(s.ctaLabel)}</a></p>` +
    `<p>${escapeHtml(s.signature)}</p>`;

  return { subject: s.subject, textBody, htmlBody };
}
