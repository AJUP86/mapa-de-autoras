// AdminGate.tsx — Stage 7a
//
// Client-side session guard for /admin/* pages. Renders nothing while it
// checks the session; redirects to loginUrl if unauthenticated; signs out
// + shows a small error if the session lacks app_metadata.role = 'admin'.
//
// RLS is the real authorization gate — this component is UX, not security.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readSession, signOut, type AdminSessionState } from "~/lib/admin-session";
import { supabase } from "~/lib/supabase";

interface Props {
  loginUrl: string;
  notAdminLabel: string;
  children: ReactNode;
}

export default function AdminGate({ loginUrl, notAdminLabel, children }: Props) {
  const [state, setState] = useState<AdminSessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    readSession().then((s) => {
      if (cancelled) return;
      setState(s);
      if (s.kind === "anonymous") window.location.replace(loginUrl);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        setState({ kind: "anonymous" });
        window.location.replace(loginUrl);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loginUrl]);

  if (state.kind === "loading" || state.kind === "anonymous") {
    return null;
  }
  if (state.kind === "not-admin") {
    return (
      <div className="p-6 text-center">
        <p className="text-oxblood">{notAdminLabel}</p>
        <button
          onClick={async () => {
            await signOut();
            window.location.replace(loginUrl);
          }}
          className="mt-4 underline"
        >
          OK
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
