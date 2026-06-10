// translate.ts — Stage 7b-i
//
// Browser-side wrapper around the /functions/v1/translate Edge Function.
// Sends the admin JWT (managed by supabase-js) via the supabase.functions
// helper, which adds the Authorization header automatically.

import { supabase } from "./supabase";

export type TargetLang = "EN" | "ES";

export async function translateText(
  text: string,
  target_lang: TargetLang,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>(
    "translate",
    { body: { text, target_lang } },
  );
  if (error) {
    throw new Error(error.message || "translation_failed");
  }
  if (!data || data.error) {
    throw new Error(data?.error || "translation_failed");
  }
  return data.text ?? "";
}
