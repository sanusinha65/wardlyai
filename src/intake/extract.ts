import type {
    ChiefComplaintTheme,
    Demographics,
    HpiState,
    IntakeState,
    IntakeStep,
    RosLine,
} from './types';

const lower = (s: string) => s.toLowerCase()

/**
 * Pull the first plausible age (1–119) from free text, ignoring obvious noise like
 * times of day or zip codes. Returns null when no plausible match is found.
 */
function extractAgeYears(text: string): { ageNumber: number | null; ageRaw: string } {
  const t = text.trim()
  if (!t) return { ageNumber: null, ageRaw: '' }

  // Prefer "<n> year(s) old" / "<n> yo" / "<n>-year-old" forms - least ambiguous.
  const explicit = t.match(/\b(\d{1,3})\s*(?:-?\s*year[s]?(?:\s*-?\s*old)?|y\/?o|yo)\b/i)
  if (explicit) {
    const n = parseInt(explicit[1], 10)
    if (n >= 0 && n < 120) return { ageNumber: n, ageRaw: `${n}` }
  }

  // Fallback: first standalone integer in the string within plausible age range.
  const generic = t.match(/(?<!\d)(\d{1,3})(?!\d)/)
  if (generic) {
    const n = parseInt(generic[1], 10)
    if (n >= 0 && n < 120) return { ageNumber: n, ageRaw: `${n}` }
  }
  return { ageNumber: null, ageRaw: '' }
}

/**
 * Canonicalize free-form sex/gender input. Returns canonical label and the original phrase
 * so the brief can fall back to the patient's own wording when our taxonomy doesn't fit.
 */
function extractSex(text: string): { sex: string; sexRaw: string } {
  const t = ` ${lower(text)} `
  if (/\bnon[-\s]?binary\b|\benby\b|\bnb\b/.test(t)) return { sex: 'non-binary', sexRaw: text.trim() }
  if (/\b(?:trans(?:gender)?|intersex|other|prefer not)\b/.test(t)) {
    return { sex: 'other', sexRaw: text.trim() }
  }
  if (/\b(?:female|woman|girl|f)\b/.test(t)) return { sex: 'female', sexRaw: text.trim() }
  if (/\b(?:male|man|boy|m)\b/.test(t)) return { sex: 'male', sexRaw: text.trim() }
  return { sex: '', sexRaw: '' }
}

/**
 * Heuristic name extraction. Strips age/sex tokens and digits, then takes the leftmost run
 * of letters / hyphens. Empty string when nothing namelike remains (e.g. "34, female").
 */
function extractName(text: string): string {
  let t = text.trim()
  if (!t) return ''
  if (/^(skip|none|no|n\/a|na|prefer not)\b/i.test(t)) return ''

  t = t.replace(/\b\d{1,3}\s*(?:-?\s*year[s]?(?:\s*-?\s*old)?|y\/?o|yo)\b/gi, ' ')
  t = t.replace(/\b\d+\b/g, ' ')
  t = t.replace(
    /\b(?:female|woman|girl|male|man|boy|non[-\s]?binary|enby|nb|trans(?:gender)?|intersex|other|prefer not to say|prefer not|m|f)\b/gi,
    ' ',
  )
  t = t
    .replace(/\b(?:i'?m|i am|my name is|name is|name:|im|hi|hello|this is)\b/gi, ' ')
    .replace(/[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const m = t.match(/[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*){0,3}/)
  if (!m) return ''
  // Title-case each word so "jane k" → "Jane K".
  return m[0]
    .split(/\s+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .slice(0, 60)
}

export function extractDemographics(text: string): Demographics {
  const { ageNumber, ageRaw } = extractAgeYears(text)
  const { sex, sexRaw } = extractSex(text)
  const name = extractName(text)
  return { name, ageNumber, ageRaw, sex, sexRaw }
}

export function createEmptyDemographics(): Demographics {
  return { name: '', ageRaw: '', ageNumber: null, sex: '', sexRaw: '' }
}

/**
 * Heuristic theme for tailoring ROS questions.
 */
export function inferChiefComplaintTheme(text: string): ChiefComplaintTheme {
  const t = lower(text)
  if (/(cough|wheeze|short of breath|sob|sputum|breath|lung|pneumonia|asthma)/.test(t)) {
    return 'resp'
  }
  if (/(chest|heart|palpitation|pressure in chest|tightness.*chest|angina)/.test(t)) {
    return 'cardiac'
  }
  if (/(headache|dizzy|dizziness|faint|syncope|seizure|numb|tingling|stroke|vision)/.test(t)) {
    return 'neuro'
  }
  if (/(nausea|vomit|diarrhea|constipation|stomach|abdominal|abdomen|gi)/.test(t)) {
    return 'gi'
  }
  if (/(joint|knee|back|neck|arm|leg|swelling|stiff|muscle|arthritis|injur)/.test(t)) {
    return 'msk'
  }
  if (/(rash|itch|skin|lesion|mole|hives)/.test(t)) {
    return 'derm'
  }
  return 'general'
}

function trimSentence(s: string, max = 500): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

/**
 * Map yes/no and short phrases; keeps raw text for narrative fields.
 */
function yesNoMeaningful(text: string): string {
  const t = lower(text)
  if (/^(y|yes|yeah|yep|sure|correct|definitely|positive)\b/.test(t)) return 'Yes'
  if (/^(n|no|nope|nah|negative|none|not really)\b/.test(t)) return 'No'
  return trimSentence(text, 300)
}

/** Pull numeric severity: "8/10", "7 out of 10", or adjectives */
function extractSeverity(text: string): string {
  const t = lower(text)
  const m = t.match(/(\d{1,2})\s*(?:\/|out of)\s*10/)
  if (m) return `${m[1]}/10`
  if (/(severe|terrible|worst|unbearable)/.test(t)) return 'Severe (verbal)'
  if (/(moderate|medium)/.test(t)) return 'Moderate (verbal)'
  if (/(mild|slight|minor|little bit)/.test(t)) return 'Mild (verbal)'
  return trimSentence(text, 120)
}

/**
 * After each step, fold user reply into HPI and other fields.
 */
export function applyStepToState(
  step: IntakeStep,
  userText: string,
  state: IntakeState,
): void {
  const t = userText
  const h = state.hpi

  switch (step) {
    case 'personal_info': {
      state.demographics = extractDemographics(t)
      break
    }
    case 'cc': {
      h.chiefComplaint = trimSentence(t, 300)
      h.theme = inferChiefComplaintTheme(t)
      break
    }
    case 'onset': {
      h.onset = trimSentence(t, 200)
      break
    }
    case 'duration': {
      h.duration = trimSentence(t, 200)
      break
    }
    case 'severity': {
      h.severity = extractSeverity(t)
      break
    }
    case 'location': {
      h.location = trimSentence(t, 200)
      break
    }
    case 'quality': {
      h.quality = trimSentence(t, 200)
      break
    }
    case 'modifiers': {
      h.modifiers = trimSentence(t, 300)
      break
    }
    case 'associated': {
      h.associatedSymptoms = trimSentence(t, 400)
      break
    }
    case 'red_flags': {
      const yn = yesNoMeaningful(t)
      if (yn === 'No') {
        state.redFlags = 'No concerning symptoms reported in screening (chest pain, SOB, focal neuro deficit, severe “worst pain”) at time of triage; details: ' + trimSentence(t, 300)
      } else if (yn === 'Yes') {
        state.redFlags = 'PATIENT ENDORSED RED FLAGS: ' + trimSentence(t, 500)
      } else {
        state.redFlags = trimSentence(t, 500)
      }
      break
    }
    case 'ros_focus_1': {
      const line = state.ros[0]
      if (line) {
        const yn = lower(t)
        if (/^(n|no|nope|negative|none|deny)\b/.test(yn) || (t.length < 3 && /no|none/i.test(yn))) {
          line.negatives.push('No additional endorsed symptoms in this system (per report).')
        } else {
          line.positives.push(trimSentence(t, 200))
        }
      }
      break
    }
    case 'ros_focus_2': {
      const line = state.ros[1]
      if (line) {
        const yn = lower(t)
        if (/^(n|no|nope|negative|none|deny)\b/.test(yn) || (t.length < 3 && /no|none/i.test(yn))) {
          line.negatives.push('No additional endorsed symptoms in this system (per report).')
        } else {
          line.positives.push(trimSentence(t, 200))
        }
      }
      break
    }
    case 'ros_general': {
      const line = state.ros[2]
      if (line) {
        const yn = lower(t).trim()
        // Only treat as a blanket denial when the reply STARTS with a negation
        // word. Earlier code matched any "no" substring, which mis-classified
        // "I noticed nausea" as a denial.
        const startsWithDenial = /^(n|no|nope|negative|none|deny|denies|nothing)\b/.test(yn)
        if (startsWithDenial && yn.split(/\s+/).length < 12) {
          line.negatives.push('Constitutional symptoms largely denied: ' + trimSentence(t, 200))
        } else {
          line.positives.push(trimSentence(t, 200))
        }
      }
      break
    }
    case 'meds': {
      state.meds = t.trim() ? trimSentence(t, 400) : 'None / unknown'
      break
    }
    case 'allergies': {
      state.allergies = t.trim() ? trimSentence(t, 200) : 'None / unknown'
      break
    }
    case 'wrap_up': {
      state.otherConcerns = t.trim() ? trimSentence(t, 400) : 'None elicited'
      break
    }
    default:
      break
  }
}

/**
 * Build initial `ros` rows based on HPI theme (used when entering `ros_focus_1`).
 */
export function buildInitialRosForTheme(theme: ChiefComplaintTheme, _hpi: HpiState): { system: string; notDiscussed: boolean }[] {
  void _hpi
  const shared = { notDiscussed: false as const }
  if (theme === 'resp') {
    return [
      { system: 'Respiratory: fever, pleuritic pain, sputum color, recent travel, sick contacts', ...shared },
      { system: 'HEENT: sore throat, nasal discharge, ear pain, sinus pressure', ...shared },
      { system: 'Constitutional / general: fevers, chills, night sweats, weight change, fatigue, appetite', ...shared },
    ]
  }
  if (theme === 'cardiac') {
    return [
      { system: 'Cardiovascular: palpitations, edema, orthopnea, PND, claudication', ...shared },
      { system: 'Pulmonary: shortness of breath, cough, wheeze', ...shared },
      { system: 'Constitutional / general: fevers, chills, weight change, fatigue', ...shared },
    ]
  }
  if (theme === 'neuro') {
    return [
      { system: 'Neurologic: weakness, numbness, speech or vision change, head injury, similar prior episodes', ...shared },
      { system: 'HEENT: ear pain, vision changes, jaw pain', ...shared },
      { system: 'Constitutional / general: fevers, chills, fatigue, weight change', ...shared },
    ]
  }
  if (theme === 'gi') {
    return [
      { system: 'GI: melena, hematochezia, recent travel, last bowel movement, focal tenderness', ...shared },
      { system: 'Constitutional: fevers, anorexia, night sweats', ...shared },
      { system: 'GU / systemic: dysuria, flank pain, rash, joint pain', ...shared },
    ]
  }
  if (theme === 'msk') {
    return [
      { system: 'MSK: morning stiffness, trauma, edema, erythema, fevers, inability to bear weight', ...shared },
      { system: 'Neurologic: radicular symptoms, numbness, weakness, bowel or bladder change', ...shared },
      { system: 'Constitutional: fevers, weight change, night sweats', ...shared },
    ]
  }
  if (theme === 'derm') {
    return [
      { system: 'Skin: spreading rash, mouth involvement, new medications, pets, fevers, joint pain', ...shared },
      { system: 'Allergic / systemic: lip swelling, breathing problems, hives, anaphylaxis history', ...shared },
      { system: 'Constitutional: fevers, chills, malaise', ...shared },
    ]
  }
  return [
    { system: 'General: fevers, chills, night sweats, weight change, fatigue, appetite', ...shared },
    { system: 'Neuro/MSK: weakness, numbness, focal deficits, injury', ...shared },
    { system: 'Pulm/GI/URI: SOB, cough, nausea, dysuria, sore throat', ...shared },
  ]
}

export function initRosLines(theme: ChiefComplaintTheme, hpi: HpiState): RosLine[] {
  return buildInitialRosForTheme(theme, hpi).map((m) => ({
    system: m.system,
    positives: [],
    negatives: [],
    notDiscussed: m.notDiscussed,
  }))
}

export function createEmptyHpiState(): HpiState {
  return {
    chiefComplaint: '',
    theme: 'general',
    onset: '',
    duration: '',
    severity: '',
    location: '',
    quality: '',
    modifiers: '',
    associatedSymptoms: '',
  }
}

export function createEmptyIntakeState(): IntakeState {
  return {
    demographics: createEmptyDemographics(),
    hpi: createEmptyHpiState(),
    redFlags: '',
    ros: [],
    meds: '',
    allergies: '',
    otherConcerns: '',
  }
}
