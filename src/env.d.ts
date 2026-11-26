/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminEmail?: string;
    userId?: string;
    userEmail?: string;
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_SECRET_KEY?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_PUBLISHABLE_KEY?: string;
  readonly INSFORGE_URL?: string;
  readonly INSFORGE_API_KEY?: string;
  readonly INSFORGE_ANON_KEY?: string;
  readonly PLAYER_TOKEN: string;
  readonly OPENROUTER_API_KEY?: string;
  readonly OPENROUTER_TEXT_MODEL?: string;
  readonly OPENROUTER_VISION_MODEL?: string;
  readonly UTC_OFFSET_MIN?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
