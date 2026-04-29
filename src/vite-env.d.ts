/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string
  /** e.g. gemini-2.5-flash, gemini-2.5-flash-lite */
  readonly VITE_GEMINI_MODEL?: string
  /** BCP 47 tag for Web Speech API, e.g. en-US, en-IN, hi-IN */
  readonly VITE_SPEECH_LANG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
