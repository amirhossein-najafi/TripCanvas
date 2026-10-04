"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getRepository } from "@/lib/api";
import { RepoError } from "@/lib/api/repository";
import type { User } from "@/types";

type SessionValue = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    getRepository()
      .currentUser()
      .then((next) => {
        if (live) setUser(next);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      async signIn(email, password) {
        try {
          const next = await getRepository().signIn(email, password);
          setUser(next);
          return next;
        } catch (error) {
          throw error instanceof RepoError ? error : new RepoError("Could not sign in.");
        }
      },
      async signUp(name, email, password) {
        const next = await getRepository().signUp(name, email, password);
        setUser(next);
        return next;
      },
      async signOut() {
        await getRepository().signOut();
        setUser(null);
      },
    }),
    [ready, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session missing");
  return value;
}
