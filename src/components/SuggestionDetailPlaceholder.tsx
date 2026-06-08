// SuggestionDetailPlaceholder.tsx — Stage 7a (placeholder, replaced in 7b)
//
// Reads the suggestion id from the URL query string (`?id=...`) and renders
// the placeholder copy. We're on a static Astro build, so we can't use a
// dynamic route like /admin/suggestions/[id] — the page lives at the static
// path /admin/suggestion and gets the id at runtime in the browser.

import { useEffect, useState } from "react";

interface Labels {
  title: string;
  body: string;
}

interface Props {
  labels: Labels;
}

export default function SuggestionDetailPlaceholder({ labels }: Props) {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setId(params.get("id"));
  }, []);

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-2xl text-ink">{labels.title}</h1>
      <p className="mt-2 text-ink/70">{labels.body}</p>
      {id && <p className="mt-4 text-xs text-ink/50">ID: {id}</p>}
    </section>
  );
}
