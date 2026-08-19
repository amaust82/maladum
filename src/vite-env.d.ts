/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL for cross-device sync (src/sync/). Unset = sync stays offline-only. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon/public key — safe for client code, RLS is what keeps it safe. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
