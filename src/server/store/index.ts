import "server-only";
import { hasSupabase } from "../env";
import { memoryStore } from "./memory";
import { supabaseStore } from "./supabase";

export const store = hasSupabase ? supabaseStore : memoryStore;
