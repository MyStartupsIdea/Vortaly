"use client";

import { useMemo } from "react";
import { MiniApp } from "@/components/tma/MiniApp";
import { CatalogProvider, catalogFromSpec } from "@/lib/booking/catalog";
import type { SiteSpec } from "@/lib/builder/spec";

/**
 * A generated business page: the spec, rendered.
 *
 * Used twice with the same code path — as the public tenant page for the
 * published spec, and as the builder's live preview for the draft — so what an
 * operator sees while editing is exactly what a customer will get.
 */
export function TenantSite({ spec, preview = false }: { spec: SiteSpec; preview?: boolean }) {
  const catalog = useMemo(() => catalogFromSpec(spec), [spec]);

  return (
    <CatalogProvider value={catalog}>
      <MiniApp preview={preview} />
    </CatalogProvider>
  );
}
