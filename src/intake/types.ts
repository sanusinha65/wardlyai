export type MessageRole = 'agent' | 'user'

export interface Message {
  id: string
  role: MessageRole
  content: string
  ts: number
}

export type IntakeStep =
  | 'welcome'
  | 'cc'
  | 'onset'
  | 'duration'
  | 'severity'
  | 'location'
  | 'quality'
  | 'modifiers'
  | 'associated'
  | 'red_flags'
  | 'ros_focus_1'
  | 'ros_focus_2'
  | 'ros_general'
  | 'meds'
  | 'allergies'
  | 'wrap_up'
  | 'complete'

export type ChiefComplaintTheme = 'resp' | 'cardiac' | 'neuro' | 'gi' | 'msk' | 'derm' | 'general'

/** HPI line items (filled incrementally; empty strings = not yet captured) */
export interface HpiState {
  chiefComplaint: string
  /** theme inferred from free text, used to tailor ROS */
  theme: ChiefComplaintTheme
  onset: string
  duration: string
  severity: string
  location: string
  quality: string
  modifiers: string
  associatedSymptoms: string
}

/** A single system line in the ROS; positives / negatives are short phrases from the patient. */
export interface RosLine {
  system: string
  positives: string[]
  negatives: string[]
  /** "not asked" for sections skipped */
  notDiscussed: boolean
}

export interface IntakeState {
  hpi: HpiState
  redFlags: string
  /** Focused and general review answers, keyed loosely by label */
  ros: RosLine[]
  meds: string
  allergies: string
  otherConcerns: string
}

export interface ClinicalBrief {
  cc: string
  hpi: string
  ros: string
  /** For clinician: raw structured snapshot */
  _internal?: { intake: IntakeState }
}

/** Incremental brief shown in the right panel while the intake is in progress */
export interface LiveBrief {
  cc: string | null
  hpiFragments: {
    onset: string | null
    duration: string | null
    severity: string | null
    location: string | null
    quality: string | null
    modifiers: string | null
    associatedSymptoms: string | null
  }
  rosProgress: { system: string; status: 'pending' | 'completed' }[]
  redFlags: string | null
}

export interface IntakeSession {
  messages: Message[]
  step: IntakeStep
  intake: IntakeState
  complete: boolean
  brief: ClinicalBrief | null
  liveBrief: LiveBrief
}

export const INTAKE_STEPS: IntakeStep[] = [
  'welcome',
  'cc',
  'onset',
  'duration',
  'severity',
  'location',
  'quality',
  'modifiers',
  'associated',
  'red_flags',
  'ros_focus_1',
  'ros_focus_2',
  'ros_general',
  'meds',
  'allergies',
  'wrap_up',
  'complete',
]

export function stepIndex(s: IntakeStep): number {
  return INTAKE_STEPS.indexOf(s)
}

export const STEP_LABEL: Record<IntakeStep, string> = {
  welcome: 'Start',
  cc: 'Chief complaint',
  onset: 'Onset',
  duration: 'Duration',
  severity: 'Severity',
  location: 'Location / radiation',
  quality: 'Character',
  modifiers: 'Aggravating / relieving',
  associated: 'Associated symptoms',
  red_flags: 'Red flags',
  ros_focus_1: 'Review (focused) 1',
  ros_focus_2: 'Review (focused) 2',
  ros_general: 'Review (general)',
  meds: 'Medications',
  allergies: 'Allergies',
  wrap_up: 'Other concerns',
  complete: 'Brief',
}
