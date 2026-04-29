import type { ChiefComplaintTheme, IntakeState } from './types'

export interface ClinicalInsight {
  category: 'urgency' | 'differential' | 'workup'
  level: 'info' | 'warning' | 'alert'
  title: string
  description: string
}

function extractMaxSeverity0to10(text: string): number | null {
  const t = text.toLowerCase()
  const m = t.match(/(\d{1,2})\s*(?:\/|out of)\s*10/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 0 && n <= 10) return n
  }
  return null
}

function redFlagsIndicateConcern(redFlags: string): boolean {
  const t = redFlags.toLowerCase()
  if (t.includes('patient endorsed red flags') || t.includes('endorsed red flags:')) {
    return true
  }
  if (t === 'yes' || /^yes[\s,.-]/.test(t)) {
    return true
  }
  return false
}

const THEME_DIFFERENTIALS: Record<ChiefComplaintTheme, string> = {
  cardiac: 'ACS, unstable angina, arrhythmia, pericarditis, myocarditis',
  resp: 'Viral URI, influenza, COVID-19, bacterial pneumonia, asthma exacerbation',
  neuro: 'Migraine, tension-type headache, TIA/stroke, intracranial mass, meningitis',
  gi: 'Gastroenteritis, appendicitis, IBD flare, pancreatitis, PUD',
  msk: 'Sprain/strain, fracture, arthritis flare, radiculopathy, compartment syndrome',
  derm: 'Contact dermatitis, allergic reaction, infection, autoimmune process',
  general: 'Viral syndrome, medication side effect, anxiety, deconditioning',
}

export function generateInsights(intake: IntakeState): ClinicalInsight[] {
  const insights: ClinicalInsight[] = []
  const hpi = intake.hpi
  const theme = hpi.theme

  const severityNum = extractMaxSeverity0to10(hpi.severity)
  if (severityNum !== null && severityNum >= 8) {
    insights.push({
      category: 'urgency',
      level: 'alert',
      title: 'High severity presentation',
      description: `Patient reports ${hpi.severity.trim()}. Consider prioritization and thorough assessment.`,
    })
  }

  if (intake.redFlags.trim() && redFlagsIndicateConcern(intake.redFlags)) {
    insights.push({
      category: 'urgency',
      level: 'alert',
      title: 'Red flags endorsed',
      description:
        'Screening red flags were endorsed on screening questions. Consider expedited evaluation per institutional protocol.',
    })
  }

  if (theme !== 'general' && hpi.chiefComplaint.trim()) {
    const label = theme.charAt(0).toUpperCase() + theme.slice(1)
    insights.push({
      category: 'differential',
      level: 'info',
      title: `${label} differentials (not exhaustive)`,
      description: `Consider: ${THEME_DIFFERENTIALS[theme]}.`,
    })
  }

  const loc = hpi.location.toLowerCase()
  const assoc = hpi.associatedSymptoms.toLowerCase()
  if (theme === 'cardiac' && (loc.includes('chest') || assoc.includes('shortness') || assoc.includes('sob'))) {
    insights.push({
      category: 'workup',
      level: 'warning',
      title: 'Cardiac workup considerations',
      description:
        'Document ECG, troponin trend, and risk stratification (e.g. HEART or TIMI) when chest or exertional symptoms are present.',
    })
  }

  if (theme === 'resp' && assoc.includes('fever')) {
    insights.push({
      category: 'workup',
      level: 'info',
      title: 'Respiratory testing',
      description:
        'Fever with respiratory context: consider influenza, COVID-19, and other testing per season and local guidance.',
    })
  }

  return insights
}
