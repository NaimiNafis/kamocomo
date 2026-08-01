/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  /** Optional: Cloud-styled Map ID whose style hides every label layer.
   * Only needed for the graphical + labels-off combination. */
  readonly VITE_GOOGLE_MAPS_LABEL_FREE_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
