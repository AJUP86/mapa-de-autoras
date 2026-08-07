// BookFields.tsx — Stage 7b-i
//
// One book's worth of fields, used N times inside PromoteForm. The parent
// owns the array of book values + updates one by index via `onChange`.

import TranslateButton from "./TranslateButton";

export interface BookValue {
  title: string;
  year: string; // string in the form; coerced to number at submit
  original_language: string;
  cover_url: string;
  description_es: string;
  description_en: string;
}

export const EMPTY_BOOK: BookValue = {
  title: "",
  year: "",
  original_language: "",
  cover_url: "",
  description_es: "",
  description_en: "",
};

interface Labels {
  title_label: string;
  year_label: string;
  language_label: string;
  cover_label: string;
  description_es_label: string;
  description_en_label: string;
  remove: string;
  translate_to_en: TranslateLabels;
  translate_to_es: TranslateLabels;
}

interface TranslateLabels {
  button: string;
  confirm_title: string;
  confirm_body: string;
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

interface Props {
  index: number;
  value: BookValue;
  onChange: (next: BookValue) => void;
  onRemove?: () => void;
  labels: Labels;
}

export default function BookFields({ index, value, onChange, onRemove, labels }: Props) {
  return (
    <div className="space-y-3 rounded border border-ink/10 bg-bone/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Libro {index + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-oxblood underline">
            {labels.remove}
          </button>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-ink/80">{labels.title_label} *</span>
        <input
          type="text"
          required
          maxLength={500}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.year_label}</span>
          <input
            type="number"
            min={1000}
            max={2100}
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/80">{labels.language_label}</span>
          <input
            type="text"
            value={value.original_language}
            onChange={(e) => onChange({ ...value, original_language: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink/80">{labels.cover_label}</span>
        <input
          type="url"
          value={value.cover_url}
          onChange={(e) => onChange({ ...value, cover_url: e.target.value })}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.description_es_label}</span>
          <textarea
            rows={3}
            value={value.description_es}
            onChange={(e) => onChange({ ...value, description_es: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/80">{labels.description_en_label}</span>
          <textarea
            rows={3}
            value={value.description_en}
            onChange={(e) => onChange({ ...value, description_en: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <TranslateButton
          sourceText={value.description_es}
          hasTargetContent={value.description_en.trim().length > 0}
          targetLang="EN"
          onTranslated={(text) => onChange({ ...value, description_en: text })}
          labels={labels.translate_to_en}
        />
        <TranslateButton
          sourceText={value.description_en}
          hasTargetContent={value.description_es.trim().length > 0}
          targetLang="ES"
          onTranslated={(text) => onChange({ ...value, description_es: text })}
          labels={labels.translate_to_es}
        />
      </div>
    </div>
  );
}
