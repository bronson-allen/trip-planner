/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAPBOX_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
