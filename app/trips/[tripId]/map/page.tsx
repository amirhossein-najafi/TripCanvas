"use client";

import { MapStage } from "@/components/map/map-stage";
import { useViewport } from "@/lib/use-viewport";

export default function Page() {
  const mode = useViewport();
  if (mode === "desktop") return <p className="p-6 text-muted">The map stays open beside the plan.</p>;
  return <MapStage />;
}
