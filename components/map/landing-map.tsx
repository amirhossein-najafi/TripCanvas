"use client";

import "@/lib/map-worker";
import { Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export function LandingMap({ center, zoom }: { center: [number, number]; zoom: number }) {
  const { resolvedTheme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (!ref.current) return;
    const map = new MapLibre({
      container: ref.current,
      style: STYLES[theme],
      center,
      zoom: 1.6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom, speed: 0.35, curve: 1.4, essential: true });
  }, [center[0], center[1], zoom]);

  return <div ref={ref} className="h-full w-full" />;
}
