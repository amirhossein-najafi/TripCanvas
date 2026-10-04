import { createLocalRepository } from "@/lib/api/local-repository";
import type { Repository } from "@/lib/api/repository";
import { createSupabaseRepository } from "@/lib/api/supabase-repository";
import { isSupabaseConfigured } from "@/lib/supabase/env";

let repository: Repository | null = null;

export function getRepository(): Repository {
  if (!repository) {
    repository = isSupabaseConfigured() ? createSupabaseRepository() : createLocalRepository();
  }
  return repository;
}

export function repositoryMode() {
  return isSupabaseConfigured() ? "supabase" : "local";
}
