"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { browserSupabase } from "@/lib/supabase/client";
import type { User } from "@/types";

export type PresenceCursor = { x: number; y: number; surface: string };
export type PresenceDrag = { activityId: string; title: string; overId: string | null; x: number; y: number };
export type PresencePeer = { id: string; name: string; cursor: PresenceCursor | null; drag: PresenceDrag | null };

type Track = { id: string; name: string; cursor?: PresenceCursor | null; drag?: PresenceDrag | null };

export function usePresence(tripId: string | undefined, user: User | null) {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const publishRef = useRef<(patch: Partial<Track>) => void>(() => undefined);

  useEffect(() => {
    if (!tripId || !user) return;
    let track: Track = { id: user.id, name: user.name, cursor: null, drag: null };
    const toPeers = (rows: Track[]) => rows
      .filter((item) => item.id && item.id !== user.id)
      .map((item) => ({ id: item.id, name: item.name, cursor: item.cursor ?? null, drag: item.drag ?? null }));

    if (isSupabaseConfigured()) {
      const supabase = browserSupabase();
      const channel = supabase.channel(`presence:${tripId}`, { config: { presence: { key: user.id } } });
      const send = (patch: Partial<Track>) => {
        track = { ...track, ...patch };
        channel.track(track);
      };
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Track[]>;
        setPeers(toPeers(Object.values(state).flat()));
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track(track);
      });
      publishRef.current = send;
      return () => {
        supabase.removeChannel(channel);
      };
    }

    const channel = new BroadcastChannel(`tripcanvas-presence-${tripId}`);
    const known = new Map<string, { peer: PresencePeer; seen: number }>();
    const send = (patch: Partial<Track>) => {
      track = { ...track, ...patch };
      channel.postMessage({ type: "here", user: track });
    };
    channel.onmessage = (event) => {
      const peer = event.data?.user as Track | undefined;
      if (!peer || peer.id === user.id) return;
      known.set(peer.id, {
        seen: Date.now(),
        peer: { id: peer.id, name: peer.name, cursor: peer.cursor ?? null, drag: peer.drag ?? null },
      });
      setPeers([...known.values()].map((item) => item.peer));
      if (event.data.type === "here") channel.postMessage({ type: "ack", user: track });
    };
    send({});
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [id, item] of known) if (now - item.seen > 9000) known.delete(id);
      setPeers([...known.values()].map((item) => item.peer));
      send({});
    }, 3000);
    publishRef.current = send;
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [tripId, user]);

  const onlineIds = peers.map((peer) => peer.id);
  const publish = useCallback((patch: Partial<Track>) => publishRef.current(patch), []);
  return { onlineIds, peers, publish };
}

const PresenceContext = createContext<ReturnType<typeof usePresence> | null>(null);

export function PresenceProvider({ tripId, user, children }: { tripId: string; user: User | null; children: ReactNode }) {
  const presence = usePresence(tripId, user);
  return createElement(PresenceContext.Provider, { value: presence }, children);
}

export function useTripPresence() {
  const presence = useContext(PresenceContext);
  if (!presence) throw new Error("Presence is only available inside a trip.");
  return presence;
}
