import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TripCanvas",
    short_name: "TripCanvas",
    description: "Plan less. Experience more.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eee6",
    theme_color: "#e25b45",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
