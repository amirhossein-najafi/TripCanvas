"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/panel";
import { useTrip } from "@/features/trips/trip-provider";
import type { Activity, ActivityStatus } from "@/types";

const STATUSES: ActivityStatus[] = ["planned", "done", "skipped"];

export function ActivityEditor({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const { bundle, actions } = useTrip();
  const [startTime, setStartTime] = useState(activity.startTime);
  const [duration, setDuration] = useState(String(activity.duration));
  const [plannedCost, setPlannedCost] = useState(String(activity.plannedCost));
  const [actualCost, setActualCost] = useState(activity.actualCost == null ? "" : String(activity.actualCost));
  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const [note, setNote] = useState(activity.note);
  return (
    <Modal open onClose={onClose} title={activity.title}>
      <div className="space-y-3 p-4">
        <h2 className="font-serif text-3xl font-semibold">{activity.title}</h2>
        <label className="block text-sm">Time
          <input value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 h-10 w-full rounded-xl bg-background px-3" />
        </label>
        <label className="block text-sm">Duration (minutes)
          <input value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 h-10 w-full rounded-xl bg-background px-3" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Cost
            <input value={plannedCost} onChange={(event) => setPlannedCost(event.target.value)} className="mt-1 h-10 w-full rounded-xl bg-background px-3" />
          </label>
          <label className="text-sm">Actual
            <input value={actualCost} onChange={(event) => setActualCost(event.target.value)} className="mt-1 h-10 w-full rounded-xl bg-background px-3" />
          </label>
        </div>
        <div className="flex gap-2">
          {STATUSES.map((item) => (
            <label key={item} className="flex items-center gap-1 text-sm capitalize">
              <input data-testid={`activity-status-${item}`} type="radio" checked={status === item} onChange={() => setStatus(item)} /> {item}
            </label>
          ))}
        </div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Notes" className="w-full rounded-2xl bg-background p-3" />
        <div className="flex gap-2">
          <Button onClick={() => {
            actions.updateActivity(activity.id, {
              startTime,
              duration: Number(duration) || activity.duration,
              plannedCost: Number(plannedCost) || 0,
              actualCost: actualCost === "" ? null : Number(actualCost),
              status,
              note,
            }).then(onClose).catch(() => undefined);
          }}>Save</Button>
          <button type="button" className="text-sm text-accent" onClick={() => actions.deleteActivity(activity.id).then(onClose)}>Delete</button>
        </div>
        <p className="text-xs text-muted">{bundle?.trip.currency}</p>
      </div>
    </Modal>
  );
}
