"use client";

import { X } from "lucide-react";
import { categoryMeta } from "@/lib/categories";
import { hoursLabel } from "@/lib/hours";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { Place } from "@/types";

export function PlaceDrawer({
  place,
  city,
  timeZone,
  saved,
  canEdit,
  onClose,
  onAdd,
  onSave,
}: {
  place: Place | null;
  city: string;
  timeZone: string;
  saved: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <Panel open={Boolean(place)} onClose={onClose} title={place?.name ?? "Place"}>
      {place && (
        <div>
          <div className="relative h-56 overflow-hidden rounded-t-[18px] bg-foreground/5">
            <img src={place.image} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={onClose} className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-card/90" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="font-serif text-4xl leading-none font-semibold">{place.name}</h2>
              <p className="mt-2 font-mono text-sm tabular">{place.rating.toFixed(1)} ★</p>
            </div>
            <p className="text-sm text-muted">
              {categoryMeta(place.category).label} · {city}
            </p>
            <p className="text-sm">{hoursLabel(place, timeZone)}</p>
            <div>
              <p className="text-xs tracking-[0.14em] text-muted uppercase">About</p>
              <p className="mt-2 leading-relaxed">{place.about}</p>
            </div>
            {canEdit && (
              <div className="flex gap-2 pt-2">
                <Button data-testid="add-to-itinerary" onClick={onAdd}>
                  + Add to itinerary
                </Button>
                <Button variant="outline" onClick={onSave}>
                  {saved ? "Saved" : "Save"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
