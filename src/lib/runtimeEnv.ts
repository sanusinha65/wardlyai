type EnvName = 'VITE_GEMINI_API_KEY' | 'VITE_GEMINI_MODEL' | 'VITE_SPEECH_LANG'

/** Docker runtime env.js first, then Vite build-time `import.meta.env`. */
export function readAppEnv(name: EnvName): string | undefined {
  if (typeof window !== 'undefined') {
    const runtime = window.__WARDLY_ENV__?.[name]
    if (typeof runtime === 'string' && runtime.trim()) return runtime.trim()
  }
  const build = import.meta.env[name]
  return typeof build === 'string' && build.trim() ? build.trim() : undefined
}
