// waitlist.ts — Stage 11. Client side of the waitlist card.
//
// joinWaitlist() is a typed stub until Stage 12 connects storage, the
// confirmation email and unsubscribe: it always resolves "not_available".
// Stage 12 replaces the body, not the signature.

import type { Locale } from "../i18n/locales";

export interface WaitlistInput {
  email: string;
  locale: Locale;
  /** The optional "news from Danny" box (unticked by default). */
  news: boolean;
}

export type WaitlistResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not_available" | "error" };

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A simple x@y.z check on the trimmed value (≤ 254 characters); the server re-validates. */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(email);
}

export async function joinWaitlist(_input: WaitlistInput): Promise<WaitlistResult> {
  return { ok: false, reason: "not_available" };
}
