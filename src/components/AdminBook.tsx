// AdminBook.tsx — Stage 11 (closed mode, spec §5.5). Mounted on the closed
// /[lang]/book ("Abre pronto"): a signed-in admin gets the real book page on
// top of it, with the same props and container as the open page
// (bookDetailProps, BOOK_MAIN_CLASS). BookDetail is loaded only for an admin.

import { lazy, Suspense } from "react";
import AdminOnly, { AdminLayer, AdminLoadBoundary, type AdminLayerLabels } from "./AdminOnly";
import type { BookDetailProps } from "./BookDetail";

const BookDetail = lazy(() => import("./BookDetail"));

interface Props extends BookDetailProps {
  /** The open page's `<main>` classes (BOOK_MAIN_CLASS). */
  mainClass: string;
  adminLabels: AdminLayerLabels;
}

export default function AdminBook({ mainClass, adminLabels, ...props }: Props) {
  return (
    <AdminOnly>
      <AdminLayer className="fixed inset-0 z-[70] overflow-y-auto bg-parchment">
        <main className={mainClass}>
          <AdminLoadBoundary labels={adminLabels}>
            <Suspense fallback={null}>
              <BookDetail {...props} />
            </Suspense>
          </AdminLoadBoundary>
        </main>
      </AdminLayer>
    </AdminOnly>
  );
}
