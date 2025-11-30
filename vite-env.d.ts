/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLIGHT_STATUS_ENDPOINT?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
