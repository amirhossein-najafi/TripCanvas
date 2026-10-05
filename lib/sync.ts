export type QueuedChange = {
  id: string;
  tripId: string;
  baseRevision: number;
  label: string;
};

export function queueChange<T extends QueuedChange>(queue: T[], change: T) {
  return [...queue.filter((item) => item.id !== change.id), change];
}

export function dropChange<T extends QueuedChange>(queue: T[], id: string) {
  return queue.filter((item) => item.id !== id);
}

/** The device edited an older copy than the one now on the server. */
export function hasConflict(baseRevision: number, serverRevision: number) {
  return serverRevision > baseRevision;
}

export function pendingCount(queue: QueuedChange[], tripId?: string) {
  return queue.filter((item) => !tripId || item.tripId === tripId).length;
}
