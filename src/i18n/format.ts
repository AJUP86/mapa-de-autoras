// format.ts — Stage 11. Tiny helpers for i18n strings with placeholders.

/** Replace {name} placeholders; unknown placeholders stay as they are. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Pick the singular template only for exactly 1, then fill {n}. */
export function plural(n: number, one: string, other: string): string {
  return fmt(n === 1 ? one : other, { n });
}
