// Toast.tsx — Stage 11. A short message at the bottom center of /map (the
// one-time region hint). The live region stays mounted so screen readers
// announce the message when it appears. On phones it sits just above the
// re-center button (MapControls: bottom + 92 px, 44 px tall), which a
// full-width toast would cover. `md:` = DESKTOP_MIN_WIDTH in layout.ts.

import { useEffect, useRef } from "react";

interface Props {
  message: string | null;
  /** How long the message stays, in ms. */
  duration?: number;
  onDone: () => void;
}

export default function Toast({ message, duration = 4500, onDone }: Props) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => onDoneRef.current(), duration);
    return () => window.clearTimeout(id);
  }, [message, duration]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)_+_148px)] z-40 flex justify-center px-4 md:bottom-[calc(env(safe-area-inset-bottom,0px)_+_90px)]"
    >
      {message && (
        <p className="max-w-full rounded-full bg-ink px-[18px] py-2.5 text-center text-[0.88rem] leading-snug text-bone shadow-float">
          {message}
        </p>
      )}
    </div>
  );
}
