const LIGHT = "https://tiles.openfreemap.org/styles/liberty";
const FIORD = "https://tiles.openfreemap.org/styles/fiord";

const LAYER_PAINT: Record<string, Record<string, string | number>> = {
  background: { "background-color": "#3f3832" },
  water: { "fill-color": "#1f7ea0" },
  landcover_ice_shelf: { "fill-color": "#d7e4ea", "fill-opacity": 0.7 },
  landuse_residential: { "fill-color": "#524a43", "fill-opacity": 0.95 },
  landcover_wood: { "fill-color": "#3e6b4e", "fill-opacity": 0.9 },
  park: { "fill-color": "#3f7d5a", "fill-opacity": 0.85 },
  park_outline: { "line-color": "#8fd0a8" },
  waterway: { "line-color": "#49b4d4", "line-opacity": 1 },
  building: { "fill-color": "#2a2622", "fill-opacity": 0.72 },
  tunnel_motorway_casing: { "line-color": "#efe6da" },
  tunnel_motorway_inner: { "line-color": "#c4b4a2" },
  "aeroway-taxiway": { "line-color": "#d9cec0" },
  "aeroway-runway-casing": { "line-color": "#f6eee6" },
  "aeroway-area": { "fill-color": "#4a433c" },
  "aeroway-runway": { "line-color": "#f6eee6" },
  road_area_pier: { "fill-color": "#6b6158" },
  road_pier: { "line-color": "#6b6158" },
  highway_path: { "line-color": "#cbbba8" },
  highway_minor: { "line-color": "#e4d5c4", "line-opacity": 1 },
  highway_major_casing: { "line-color": "#fff8f0" },
  highway_major_inner: { "line-color": "#f0e2d0" },
  highway_major_subtle: { "line-color": "#d8c8b4", "line-opacity": 1 },
  highway_motorway_casing: { "line-color": "#ffe7d4", "line-opacity": 1 },
  highway_motorway_inner: { "line-color": "#ffb087" },
  highway_motorway_subtle: { "line-color": "#ffb087" },
  railway_transit: { "line-color": "#e7d3c0" },
  railway_transit_dashline: { "line-color": "#fff6ec" },
  railway_service: { "line-color": "#e7d3c0" },
  railway_service_dashline: { "line-color": "#fff6ec" },
  railway: { "line-color": "#e7d3c0" },
  railway_dashline: { "line-color": "#fff6ec" },
  boundary_state: { "line-color": "#f6eee6", "line-opacity": 0.45 },
  "boundary_country_z0-4": { "line-color": "#fff6ec", "line-opacity": 0.9 },
  "boundary_country_z5-": { "line-color": "#fff6ec", "line-opacity": 0.9 },
};

type StyleLayer = { id: string; type?: string; paint?: Record<string, unknown> };
type StyleDoc = { layers: StyleLayer[] };

let darkStyle: Promise<StyleDoc> | null = null;

function tuneDarkStyle(style: StyleDoc) {
  for (const layer of style.layers) {
    const paint = LAYER_PAINT[layer.id];
    if (paint) {
      layer.paint = { ...layer.paint, ...paint };
    }
    if (layer.type === "symbol" && layer.paint && "text-color" in layer.paint) {
      layer.paint["text-color"] = "#fff8f1";
      layer.paint["text-halo-color"] = "#1a1613";
      layer.paint["text-halo-width"] = 1.6;
      if ("text-opacity" in layer.paint) layer.paint["text-opacity"] = 1;
    }
  }
  return style;
}

export function resolveMapStyle(theme: "light" | "dark"): Promise<string | StyleDoc> {
  if (theme === "light") return Promise.resolve(LIGHT);
  darkStyle ??= fetch(FIORD)
    .then((response) => {
      if (!response.ok) throw new Error("Map style failed");
      return response.json() as Promise<StyleDoc>;
    })
    .then(tuneDarkStyle);
  return darkStyle;
}
