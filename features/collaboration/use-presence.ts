"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { browserSupabase } from "@/lib/supabase/client";
import type { User } from "@/types";

export function usePresence(tripId: string | undefined, user: User | null) {
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!tripId || !user) return;
    if (isSupabaseConfigured()) {
      const supabase = browserSupabase();
      const channel = supabase.channel(`presence:${tripId}`, { config: { presence: { key: user.id } } });
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { id?: string }[]>;
        setOnlineIds(Object.values(state).flat().map((item) => item.id).filter((id): id is string => Boolean(id) && id !== user.id));
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ id: user.id, name: user.name });
      });
      return () => {
        supabase.removeChannel(channel);
      };
    }

    const channel = new BroadcastChannel(`tripcanvas-presence-${tripId}`);
    const peers = new Map<string, number>();
    const publish = () => setOnlineIds([...peers.keys()]);
    const announce = () => channel.postMessage({ type: "here", user });
    channel.onmessage = (event) => {
      const peer = event.data?.user as User | undefined;
      if (!peer || peer.id === user.id) return;
      peers.set(peer.id, Date.now());
      publish();
      if (event.data.type === "here") channel.postMessage({ type: "ack", user });
    };
    announce();
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [id, seen] of peers) if (now - seen > 9000) peers.delete(id);
      publish();
      announce();
    }, 3000);
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [tripId, user]);

  return onlineIds;
}
