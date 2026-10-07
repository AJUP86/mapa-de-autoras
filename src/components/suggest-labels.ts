// suggest-labels.ts — Stage 11. The SuggestionForm strings, resolved at build
// time: one builder for /[lang]/suggest and the suggest sheet on /[lang]/map.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";
import type { SuggestionFormLabels } from "./SuggestionForm";

export function suggestFormLabels(lang: Locale): SuggestionFormLabels {
  return {
    entry: {
      heading: t(lang, "suggest.entry.heading"),
      book_title_label: t(lang, "suggest.entry.book_title_label"),
      book_title_placeholder: t(lang, "suggest.entry.book_title_placeholder"),
      author_name_label: t(lang, "suggest.entry.author_name_label"),
      author_name_placeholder: t(lang, "suggest.entry.author_name_placeholder"),
      country_label: t(lang, "suggest.entry.country_label"),
      country_placeholder: t(lang, "suggest.entry.country_placeholder"),
      note_label: t(lang, "suggest.entry.note_label"),
      note_placeholder: t(lang, "suggest.entry.note_placeholder"),
      add: t(lang, "suggest.entry.add"),
      remove: t(lang, "suggest.entry.remove"),
    },
    fields: {
      email_label: t(lang, "suggest.fields.email_label"),
      email_placeholder: t(lang, "suggest.fields.email_placeholder"),
      email_hint: t(lang, "suggest.fields.email_hint"),
      submitter_name_label: t(lang, "suggest.fields.submitter_name_label"),
      submitter_name_placeholder: t(lang, "suggest.fields.submitter_name_placeholder"),
      newsletter_label: t(lang, "suggest.fields.newsletter_label"),
    },
    submit: t(lang, "suggest.submit"),
    submitting: t(lang, "suggest.submitting"),
    errors: {
      network: t(lang, "suggest.errors.network"),
      validation: t(lang, "suggest.errors.validation"),
      turnstile: t(lang, "suggest.errors.turnstile"),
    },
    required_mark: t(lang, "suggest.required_mark"),
  };
}
