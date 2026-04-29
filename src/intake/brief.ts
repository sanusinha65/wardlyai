import type { ClinicalBrief, IntakeState } from './types'

function joinOrNA(parts: (string | undefined | null)[], sep = ' '): string {
  return parts.filter((p) => p && String(p).trim().length > 0).join(sep).trim() || 'Not elicited'
}

/**
 * Produces a concise clinician-oriented paragraph for HPI.
 */
function buildHpiParagraph(s: IntakeState): string {
  const h = s.hpi
  const s1 = joinOrNA(
    [
      h.chiefComplaint && `Patient presents for: ${h.chiefComplaint}.`,
      h.onset && `Onset ${h.onset}.`,
      h.duration && `Duration ${h.duration}.`,
    ],
    ' ',
  )
  const s2 = joinOrNA(
    [
      h.severity && `Severity ${h.severity}.`,
      h.location && `Location / radiation: ${h.location}.`,
      h.quality && `Character: ${h.quality}.`,
    ],
    ' ',
  )
  const s3 = joinOrNA(
    [
      h.modifiers && `Modifying factors: ${h.modifiers}.`,
      h.associatedSymptoms && `Associated symptoms: ${h.associatedSymptoms}.`,
    ],
    ' ',
  )
  const s4 = s.redFlags
    ? `Triage: ${s.redFlags}`
    : 'Triage: (not recorded)'
  const s5 = s.meds
    ? `Meds: ${s.meds}.`
    : 'Meds: (not elicited).'
  const s6 = s.allergies
    ? `Allergies: ${s.allergies}.`
    : 'Allergies: (not elicited).'
  const s7 = s.otherConcerns && s.otherConcerns !== 'None elicited' ? `Additional: ${s.otherConcerns}.` : ''

  return [s1, s2, s3, s4, s5, s6, s7]
    .map((p) => p?.trim())
    .filter((p) => p && p.length > 0)
    .join(' ')
}

/**
 * One-line chief complaint: prefer the captured field, else a stub.
 */
function buildCc(s: IntakeState): string {
  const c = s.hpi.chiefComplaint.trim()
  if (c) return c
  return 'Chief complaint (not elicited)'
}

/**
 * ROS: group by system, list positives/negatives.
 */
function buildRosText(s: IntakeState): string {
  if (s.ros.length === 0) {
    return 'Review of systems: not recorded (intake may have been cut short).'
  }
  const parts: string[] = []
  for (const r of s.ros) {
    if (r.notDiscussed) {
      parts.push(`${r.system}: not discussed.`)
      continue
    }
    const pos = r.positives.length
      ? `Positive/endorsed: ${r.positives.join('; ')}.`
      : 'Positive/endorsed: (none elicited).'
    const neg = r.negatives.length
      ? `Negative/denies: ${r.negatives.join('; ')}.`
      : 'Negative/denies: (none explicitly elicited in this system).'
    parts.push(`**${r.system}** — ${pos} ${neg}`)
  }
  return parts.join('\n\n')
}

export function buildClinicalBrief(state: IntakeState): ClinicalBrief {
  return {
    cc: buildCc(state),
    hpi: buildHpiParagraph(state),
    ros: buildRosText(state),
    _internal: { intake: state },
  }
}
