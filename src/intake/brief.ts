import type { ClinicalBrief, Demographics, IntakeState } from './types'

/** Pretty label for sex/gender that prefers the patient's own phrasing when set. */
function describeSex(d: Demographics): string {
  if (d.sex && d.sex !== 'other') return d.sex
  if (d.sexRaw) return d.sexRaw
  return ''
}

/** Build the standard clinical one-liner: "Pt is a 34-year-old female presenting with X." */
export function buildLeadSentence(s: IntakeState): string {
  const d = s.demographics
  const cc = s.hpi.chiefComplaint.trim()
  if (!cc) return ''

  const subject = d.name ? d.name : 'Patient'
  const ageStr = d.ageNumber != null ? `${d.ageNumber}-year-old` : ''
  const sexStr = describeSex(d)
  const desc = [ageStr, sexStr].filter(Boolean).join(' ').trim()

  if (desc) {
    return `${subject} is a ${desc} presenting with: ${cc}.`
  }
  return `${subject} presents for: ${cc}.`
}

/**
 * Discrete HPI lines for UI (bullets) and plain-text export (joined with blank lines).
 */
export function buildHpiLines(s: IntakeState): string[] {
  const h = s.hpi
  const lines: string[] = []

  const lead =
    buildLeadSentence(s).trim() ||
    (h.chiefComplaint.trim() ? `Patient presents for: ${h.chiefComplaint.trim()}.` : '')
  if (lead) lines.push(lead)

  if (h.onset.trim()) lines.push(`Onset ${h.onset.trim()}.`)
  if (h.duration.trim()) lines.push(`Duration ${h.duration.trim()}.`)
  if (h.severity.trim()) lines.push(`Severity ${h.severity.trim()}.`)
  if (h.location.trim()) lines.push(`Location / radiation: ${h.location.trim()}.`)
  if (h.quality.trim()) lines.push(`Character: ${h.quality.trim()}.`)
  if (h.modifiers.trim()) lines.push(`Modifying factors: ${h.modifiers.trim()}.`)
  if (h.associatedSymptoms.trim()) lines.push(`Associated symptoms: ${h.associatedSymptoms.trim()}.`)

  lines.push(s.redFlags.trim() ? `Triage: ${s.redFlags.trim()}` : 'Triage: (not recorded)')

  lines.push(s.meds.trim() ? `Meds: ${s.meds.trim()}.` : 'Meds: (not elicited).')
  lines.push(s.allergies.trim() ? `Allergies: ${s.allergies.trim()}.` : 'Allergies: (not elicited).')

  const other = s.otherConcerns.trim()
  if (other && other !== 'None elicited') lines.push(`Additional: ${other}.`)

  return lines
}

/** Plain HPI for clipboard, Gemini, and any consumer expecting one string. */
function buildHpiParagraph(s: IntakeState): string {
  const lines = buildHpiLines(s)
  return lines.length > 0 ? lines.join('\n\n') : 'Not elicited'
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
    parts.push(`**${r.system}** - ${pos} ${neg}`)
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
