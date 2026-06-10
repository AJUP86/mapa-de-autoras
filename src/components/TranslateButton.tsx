// TranslateButton.tsx — Stage 7b-i
//
// Per-field-pair translate button. Reads the source value (handled by the
// parent via `getSourceText`), calls the translate Edge Function, fills the
// target via `onTranslated`. When the target field already has content,
// shows a small confirm modal first.

import { useState } from "react";
import { translateText, type TargetLang } from "~/lib/translate";

interface Labels {
  button: string;            // e.g. "Traducir →" or "← Traducir"
  confirm_title: string;     // e.g. "Reemplazar texto"
  confirm_body: string;      // e.g. "Esto reemplazará el texto actual."
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

interface Props {
  sourceText: string;
  hasTargetContent: boolean;
  targetLang: TargetLang;
  onTranslated: (text: string) => void;
  labels: Labels;
}

export default function TranslateButton({
  sourceText,
  hasTargetContent,
  targetLang,
  onTranslated,
  labels,
}: Props) {
  const [status, setStatus] = useState<"idle" | "confirm" | "loading" | "error">("idle");

  const disabled = !sourceText.trim() || status === "loading";

  async function runTranslate() {
    setStatus("loading");
    try {
      const text = await translateText(sourceText, targetLang);
      onTranslated(text);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function onClick() {
    if (disabled) return;
    if (hasTargetContent) {
      setStatus("confirm");
    } else {
      runTranslate();
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded border border-ink/20 bg-bone px-3 py-1 text-xs text-ink disabled:opacity-40"
      >
        {status === "loading" ? labels.translating : labels.button}
      </button>
      {status === "error" && (
        <span className="ml-2 text-xs text-oxblood">{labels.error}</span>
      )}
      {status === "confirm" && (
        <div className="absolute z-10 mt-2 w-64 rounded border border-ink/20 bg-parchment p-3 shadow">
          <p className="text-sm font-medium text-ink">{labels.confirm_title}</p>
          <p className="mt-1 text-xs text-ink/70">{labels.confirm_body}</p>
          <div className="mt-3 flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="rounded border border-ink/20 px-2 py-1"
            >
              {labels.confirm_cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                runTranslate();
              }}
              className="rounded bg-oxblood px-2 py-1 text-parchment"
            >
              {labels.confirm_ok}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
