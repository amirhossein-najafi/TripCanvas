"use client";

import "@/lib/map-worker";
import { resolveMapStyle } from "@/lib/map-style";
import { LngLatBounds, Map as MapLibre, Marker, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type MapMarker = {
  id: string;
  placeId: string;
  lat: number;
  lng: number;
  number: number;
  color: string;
  title: string;
  dim?: boolean;
};

export type MapRoute = {
  id: string;
  color: string;
  coordinates: [number, number][];
  active: boolean;
};

type Props = {
  markers: MapMarker[];
  routes: MapRoute[];
  highlightId?: string | null;
  focusId?: string | null;
  fitKey?: string;
  interactive?: boolean;
  className?: string;
  onMarkerClick?: (placeId: string) => void;
  onMarkerHover?: (placeId: string | null) => void;
};

export function TripMap({
  markers,
  routes,
  highlightId,
  focusId,
  fitKey,
  interactive = true,
  className,
  onMarkerClick,
  onMarkerHover,
}: Props) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const markersRef = useRef(new globalThis.Map<string, Marker>());
  const clickRef = useRef(onMarkerClick);
  const hoverRef = useRef(onMarkerHover);
  const cameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mapEpoch, setMapEpoch] = useState(0);
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  clickRef.current = onMarkerClick;
  hoverRef.current = onMarkerHover;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MapLibre | undefined;
    let timer = 0;
    let observer: ResizeObserver | undefined;
    setFailed(false);
    const initial = cameraRef.current;
    resolveMapStyle(theme)
      .then((style) => {
        if (cancelled) return;
        map = new MapLibre({
          container,
          style,
          center: initial?.center ?? [markers[0]?.lng ?? 0, markers[0]?.lat ?? 20],
          zoom: initial?.zoom ?? (markers.length ? 11 : 1.4),
          interactive,
        });
        mapRef.current = map;
        timer = window.setTimeout(() => setFailed(true), 12000);
        map.on("load", () => window.clearTimeout(timer));
        map.on("moveend", () => {
          if (!map) return;
          const center = map.getCenter();
          cameraRef.current = { center: [center.lng, center.lat], zoom: map.getZoom() };
        });
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container);
        setMapEpoch((value) => value + 1);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, [theme, attempt, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let frame = 0;
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      const live = new Set(routes.map((route) => route.id));
      const style = map.getStyle();
      for (const layer of style.layers ?? []) {
        if (layer.id.startsWith("route-") && !live.has(layer.id.slice(6))) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(layer.id)) map.removeSource(layer.id);
        }
      }
      for (const route of routes) animateRoute(map, route);
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    return () => cancelAnimationFrame(frame);
    function animateRoute(mapInstance: MapLibre, route: MapRoute) {
      const sourceId = `route-${route.id}`;
      const coords = route.coordinates;
      const paint = () => ({
        "line-color": route.color,
        "line-width": route.active ? 4.5 : 2.5,
        "line-opacity": route.active ? 0.95 : 0.38,
      });
      const apply = (shown: [number, number][]) => {
        const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: shown } };
        const source = mapInstance.getSource(sourceId) as GeoJSONSource | undefined;
        if (source) source.setData(data);
        else if (shown.length) {
          mapInstance.addSource(sourceId, { type: "geojson", data });
          mapInstance.addLayer({ id: sourceId, type: "line", source: sourceId, layout: { "line-cap": "round", "line-join": "round" }, paint: paint() });
        }
        if (mapInstance.getLayer(sourceId)) mapInstance.setPaintProperty(sourceId, "line-color", route.color);
      };
      if (coords.length < 2) {
        apply(coords);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 680);
        apply(coords.slice(0, Math.max(2, Math.round(coords.length * t))));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
  }, [routes, attempt, theme, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = () => {
      const seen = new Set<string>();
      for (const item of markers) {
        seen.add(item.id);
        let marker = markersRef.current.get(item.id);
        if (!marker) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "tc-marker";
          marker = new Marker({ element, anchor: "center" }).setLngLat([item.lng, item.lat]).addTo(map);
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            clickRef.current?.(element.dataset.placeId || "");
          });
          element.addEventListener("mouseenter", () => hoverRef.current?.(element.dataset.placeId || null));
          element.addEventListener("mouseleave", () => hoverRef.current?.(null));
          markersRef.current.set(item.id, marker);
        }
        const element = marker.getElement();
        element.dataset.placeId = item.placeId;
        element.dataset.testid = `marker-${item.placeId}`;
        element.dataset.label = item.title;
        element.style.setProperty("--c", item.color);
        element.textContent = String(item.number);
        const hot = highlightId === item.placeId || highlightId === item.id;
        element.classList.toggle("is-hot", hot);
        element.classList.toggle("is-dim", Boolean(item.dim) && !hot);
        marker.setLngLat([item.lng, item.lat]);
      }
      for (const [id, marker] of markersRef.current) {
        if (!seen.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }
    };
    if (map.isStyleLoaded()) sync();
    else map.once("load", sync);
  }, [markers, highlightId, attempt, theme, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitKey) return;
    const fit = () => {
      if (!markers.length) return;
      const bounds = new LngLatBounds();
      markers.filter((marker) => !marker.dim).forEach((marker) => bounds.extend([marker.lng, marker.lat]));
      if (bounds.isEmpty()) markers.forEach((marker) => bounds.extend([marker.lng, marker.lat]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 700 });
    };
    if (map.isStyleLoaded()) fit();
    else map.once("load", fit);
  }, [fitKey, attempt, theme, mapEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markers.find((item) => item.placeId === focusId || item.id === focusId);
    if (!map || !marker) return;
    map.flyTo({ center: [marker.lng, marker.lat], zoom: Math.max(map.getZoom(), 13.4), speed: 0.55, curve: 1.2, essential: true });
  }, [focusId, mapEpoch]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <div className="absolute inset-6 z-10 flex items-center justify-center">
          <div className="max-w-sm rounded-[18px] border border-border bg-card p-6 text-center shadow-[var(--shadow)]">
            <p className="font-serif text-2xl font-semibold">We couldn&apos;t load the map.</p>
            <p className="mt-2 text-sm text-muted">Your itinerary is safe.</p>
            <Button className="mt-4" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
