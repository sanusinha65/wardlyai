#!/bin/sh
set -e

# Runtime env for the SPA (Vite vars are otherwise baked in at build time).
js_escape() {
  printf '%s' "${1-}" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/env.js <<EOF
window.__WARDLY_ENV__ = {
  VITE_GEMINI_API_KEY: "$(js_escape "${VITE_GEMINI_API_KEY-}")",
  VITE_GEMINI_MODEL: "$(js_escape "${VITE_GEMINI_MODEL-}")",
  VITE_SPEECH_LANG: "$(js_escape "${VITE_SPEECH_LANG-}")"
};
EOF
