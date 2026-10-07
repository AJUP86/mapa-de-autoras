// BookCover.tsx — Stage 11. A book's color-block "cover": the status color
// with the title's first letter. `sm` in the /map book rows, `lg` in the
// panel's book view when the book has no usable cover image. Decorative: the
// title is always written next to it.

import type { BookStatus } from "~/lib/map-state";
import { coverLetter } from "~/lib/panel-format";
import { STATUS_FILL } from "./status-colors";

const SIZE = {
  sm: "h-[42px] w-[30px] text-[0.95rem]",
  lg: "h-[108px] w-[76px] text-[2rem]",
} as const;

interface Props {
  title: string;
  status: BookStatus;
  size: keyof typeof SIZE;
}

export default function BookCover({ title, status, size }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-[2px_6px_6px_2px] font-display font-semibold text-bone shadow-[inset_4px_0_0_var(--c-shadow)] ${SIZE[size]} ${STATUS_FILL[status]}`}
    >
      {coverLetter(title)}
    </span>
  );
}
