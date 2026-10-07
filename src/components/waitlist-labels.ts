// waitlist-labels.ts — Stage 11. Every string the waitlist card needs,
// resolved at build time (the home today; the "Abre pronto" pages in Task 7).

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";

export interface WaitlistLabels {
  soon: string;
  title: string;
  text: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  submitting: string;
  newsLabel: string;
  fine: string;
  privacyLink: string;
  privacyHref: string;
  invalid: string;
  notAvailable: string;
  error: string;
  doneTitle: string;
  /** {email} */
  doneText: string;
}

export function waitlistLabels(lang: Locale): WaitlistLabels {
  const l = (key: string) => t(lang, `home.waitlist.${key}`);
  return {
    soon: l("soon"),
    title: l("title"),
    text: l("text"),
    emailLabel: l("email_label"),
    emailPlaceholder: l("email_placeholder"),
    submit: l("submit"),
    submitting: l("submitting"),
    newsLabel: l("news_label"),
    fine: l("fine"),
    privacyLink: l("privacy_link"),
    privacyHref: `/${lang}/privacy`,
    invalid: l("invalid"),
    notAvailable: l("not_available"),
    error: l("error"),
    doneTitle: l("done_title"),
    doneText: l("done_text"),
  };
}
