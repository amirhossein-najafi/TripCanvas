"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/session";
import { getRepository, repositoryMode } from "@/lib/api";
import { DEMO_PASSWORD, demoUsers } from "@/lib/sample-trip";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(4),
});

type Values = z.infer<typeof schema>;

export function AuthScreen() {
  const { signIn, signUp } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">("in");
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "" } });

  async function finish() {
    const next = params.get("next") || "/trips";
    if (next === "/continue") {
      const raw = sessionStorage.getItem("tripcanvas.pending");
      sessionStorage.removeItem("tripcanvas.pending");
      if (raw) {
        const trip = await getRepository().createTrip(JSON.parse(raw));
        router.push(`/trips/${trip.id}/itinerary`);
        return;
      }
    }
    router.push(next);
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow)]">
        <Link href="/" className="font-serif text-2xl font-semibold">TripCanvas</Link>
        <h1 className="mt-6 font-serif text-4xl font-semibold">{mode === "in" ? "Welcome back" : "Create an account"}</h1>
        <form
          className="mt-6 space-y-3"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              if (mode === "in") await signIn(values.email, values.password);
              else await signUp(values.name || "Traveler", values.email, values.password);
              await finish();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not continue.");
            }
          })}
        >
          {mode === "up" && <input {...form.register("name")} placeholder="Name" className="h-11 w-full rounded-xl bg-background px-3" />}
          <input {...form.register("email")} placeholder="Email" className="h-11 w-full rounded-xl bg-background px-3" />
          <input type="password" {...form.register("password")} placeholder="Password" className="h-11 w-full rounded-xl bg-background px-3" />
          {form.formState.errors.email && <p className="text-sm text-accent">Use a valid email.</p>}
          <Button type="submit" className="w-full">{mode === "in" ? "Sign in" : "Create account"}</Button>
        </form>
        <button type="button" className="mt-4 text-sm text-muted" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Need an account?" : "Already have one?"}
        </button>
        {repositoryMode() === "local" && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs text-muted">Demo / offline sandbox. Passwords here stay on this device and are not real accounts. Supabase mode is the real sign-in. Demo password: {DEMO_PASSWORD}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {demoUsers.map((user) => (
                <Button key={user.id} type="button" data-testid={`continue-${user.name.toLowerCase()}`} size="sm" variant="outline" onClick={async () => { try { await signIn(user.email, user.password); await finish(); } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't sign in."); } }}>
                  Continue as {user.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
