"use client";

import "@/lib/map-worker";
import { resolveMapStyle } from "@/lib/map-style";
import { Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

export function LandingMap({ center, zoom }: { center: [number, number]; zoom: number }) {
  const { resolvedTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const centerRef = useRef(center);
  useEffect(() => {
    centerRef.current = center;
  }, [center]);
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let cancelled = false;
    let map: MapLibre | undefined;
    resolveMapStyle(theme).then((style) => {
      if (cancelled) return;
      map = new MapLibre({
        container,
        style,
        center: centerRef.current,
        zoom: 1.6,
        interactive: false,
        attributionControl: false,
      });
      mapRef.current = map;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom, speed: 0.35, curve: 1.4, essential: true });
  }, [center[0], center[1], zoom]);

  return <div ref={ref} className="h-full w-full" />;
}
