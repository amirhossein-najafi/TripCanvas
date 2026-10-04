import type { PlaceCategory } from "@/types";

export const CATEGORY_META: Record<PlaceCategory, { emoji: string; label: string }> = {
  food: { emoji: "🍜", label: "Food" },
  cafe: { emoji: "☕", label: "Cafe" },
  park: { emoji: "🌳", label: "Park" },
  shrine: { emoji: "⛩️", label: "Shrine" },
  shopping: { emoji: "🛍️", label: "Shopping" },
  museum: { emoji: "🎨", label: "Museum" },
  sight: { emoji: "📍", label: "Sight" },
  hotel: { emoji: "🏨", label: "Hotel" },
  activity: { emoji: "🎟️", label: "Activity" },
};

export function categoryMeta(category: PlaceCategory) {
  return CATEGORY_META[category];
}
