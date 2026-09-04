import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ClinicalBrief } from '../intake/types'

/** Free-tier friendly; override with VITE_GEMINI_MODEL if needed */
const DEFAULT_MODEL = 'gemini-2.5-flash'

export function getGeminiApiKey(): string | undefined {
  const k = import.meta.env.VITE_GEMINI_API_KEY
  return typeof k === 'string' && k.trim() ? k.trim() : undefined
}

export function getGeminiModelName(): string {
  const m = import.meta.env.VITE_GEMINI_MODEL
  return typeof m === 'string' && m.trim() ? m.trim() : DEFAULT_MODEL
}

/** Strip model intro lines and markdown so UI shows clean "- …" bullets only */
export function normalizeGeminiInsightBullets(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  for (let line of lines) {
    line = line.trim()
    if (!line) continue
    if (/^here are some points/i.test(line)) continue
    if (/^the following (points|items)/i.test(line)) continue
    // "*   - text" or "* - text" or "- text" or "• text"
    line = line.replace(/^\*+\s*/, '')
    line = line.replace(/^[-•]\s*/, '')
    line = line.trim()
    if (!line) continue
    out.push(`- ${line}`)
  }
  return out.join('\n')
}

function formatGeminiRequestError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err)
  if (/\[429\s*\]/.test(raw) || /quota exceeded/i.test(raw)) {
    const retryMatch = raw.match(/Please retry in ([\d.]+)s/i)
    const waitSec = retryMatch ? Math.ceil(Number.parseFloat(retryMatch[1])) : null
    const waitHint =
      waitSec != null && !Number.isNaN(waitSec)
        ? ` Try again in about ${waitSec}s, or use another model via VITE_GEMINI_MODEL (e.g. gemini-2.5-flash-lite).`
        : ' Try again shortly, or set VITE_GEMINI_MODEL to gemini-2.5-flash-lite for a separate free-tier bucket.'
    return new Error(
      `Gemini free-tier rate limit or quota for this model was hit.${waitHint} Details: https://ai.google.dev/gemini-api/docs/rate-limits`,
    )
  }
  return err instanceof Error ? err : new Error(raw)
}

/**
 * Optional AI-assisted bullet list for the Insights / AI analysis panel.
 * Requires VITE_GEMINI_API_KEY (e.g. from Google AI Studio). Not for real clinical decisions.
 */
export async function generateGeminiClinicalInsights(brief: ClinicalBrief): Promise<string> {
  const key = getGeminiApiKey()
  if (!key) {
    throw new Error('Add VITE_GEMINI_API_KEY to your .env file (Google AI Studio).')
  }

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({ model: getGeminiModelName() })

  const prompt = `You assist clinicians preparing for a visit. Do not diagnose, prescribe, or treat this as emergency care.

Read the brief below and output ONLY 4–6 bullet lines. Rules:
- No title, preamble, or closing (do not write "Here are…" or similar).
- Each line must be exactly: a hyphen, a space, then one short consideration (one line per bullet).
- Do not use asterisks, numbers, or markdown-only plain "- " lines.
- Neutral language: documentation checks, in-office verification questions, or safety-net themes. Do not diagnose, prescribe, or give emergency instructions.

Chief complaint:
${brief.cc}

History of present illness:
${brief.hpi}

Review of systems:
${brief.ros.slice(0, 12000)}`

  try {
    const out = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    })
    const raw = out.response.text().trim()
    const normalized = normalizeGeminiInsightBullets(raw)
    return normalized.length > 0 ? normalized : raw
  } catch (e) {
    throw formatGeminiRequestError(e)
  }
}
