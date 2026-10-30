/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminEmail?: string;
    userId?: string;
    userEmail?: string;
  }
}

interface ImportMetaEnv {
  readonly INSFORGE_URL: string;
  readonly INSFORGE_API_KEY: string;
  readonly INSFORGE_ANON_KEY: string;
  readonly SESSION_SECRET: string;
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
