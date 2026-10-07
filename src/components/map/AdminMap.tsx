// AdminMap.tsx — Stage 11 (closed mode, spec §5.5). Mounted on the closed
// /[lang]/map ("Abre pronto"): a signed-in admin gets the real map on top of
// it, with the same props the open page passes (mapAppProps). MapApp (d3, the
// world geometry) is loaded only for an admin, so visitors never download it.

import { lazy, Suspense } from "react";
import AdminOnly, { AdminLayer, AdminLoadBoundary, type AdminLayerLabels } from "../AdminOnly";
import type { MapAppProps } from "./MapApp";

const MapApp = lazy(() => import("./MapApp"));

export default function AdminMap({
  adminLabels,
  ...props
}: MapAppProps & { adminLabels: AdminLayerLabels }) {
  return (
    <AdminOnly>
      <AdminLayer className="fixed inset-0 z-[70] overflow-hidden bg-water">
        <main>
          <AdminLoadBoundary labels={adminLabels}>
            <Suspense fallback={null}>
              <MapApp {...props} />
            </Suspense>
          </AdminLoadBoundary>
        </main>
      </AdminLayer>
    </AdminOnly>
  );
}
