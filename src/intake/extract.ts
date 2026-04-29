import type { ChiefComplaintTheme, HpiState, IntakeState, IntakeStep, RosLine } from './types'

const lower = (s: string) => s.toLowerCase()

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
        if (lower(t).includes('no') && lower(t).split(/\s+/).length < 12) {
          line.negatives.push('Constitutional/constitutional symptoms largely denied: ' + trimSentence(t, 200))
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
    hpi: createEmptyHpiState(),
    redFlags: '',
    ros: [],
    meds: '',
    allergies: '',
    otherConcerns: '',
  }
}
