import type { IntakeStep } from './intake/types'
import { INTAKE_STEPS } from './intake/types'

/**
 * Sequenced replies for a respiratory-style demo (Loom-friendly, 1:1 with user-answer steps).
 * Order: cc → onset → duration → … → wrap_up
 */
export const RESPIRATORY_DEMO_REPLIES: string[] = [
  'Jane K, 34, female.',
  'A dry cough, sore throat, and low fever for a few days.',
  'It started about 3 days ago — I woke up with a scratchy throat, cough came the same day.',
  'It’s been about 3 days now; worse in the evening.',
  'Maybe a 5 out of 10, mostly the cough and throat bother me; fever comes and goes.',
  'Throat, chest with coughing; no one-sided leg swelling.',
  'Scratchy throat, dry/hacking cough; chest feels a bit irritated, not stabbing pain.',
  'A little better with rest, warm tea, honey; worse when lying flat at night.',
  'Low-grade fevers, chills on/off, runny nose; no vomiting; breathing is fine when I’m not coughing.',
  'No — no chest pain like pressure, no real shortness of breath, no weakness on one side, and not the worst headache ever.',
  'A bit of sinus pressure, no significant ear pain.',
  'No sputum with blood, no very bad pleuritic pain, no one sick at home on a trip; no recent travel I’m worried about.',
  'A little fatigued; appetite is a bit down; I haven’t checked my weight, no night sweats.',
  'Ibuprofen a couple times, vitamin C, a nightly melatonin — no antibiotics.',
  'Penicillin — rash; otherwise NKDA I think.',
  'I’m mostly worried I’ll get other people sick at work, but I’ve been home.',
]

const USER = INTAKE_STEPS.filter((s) => s !== 'welcome' && s !== 'complete') as IntakeStep[]

/**
 * 0-based index into the demo list for the current `step` the user is about to answer
 * (e.g. `cc` → 0, `onset` → 1, …, `wrap_up` → 14). Returns -1 if not applicable.
 */
export function sampleReplyIndexForStep(step: IntakeStep): number {
  if (step === 'complete' || step === 'welcome') return -1
  return USER.indexOf(step)
}

export function getSampleReplyForStep(step: IntakeStep): string | null {
  const i = sampleReplyIndexForStep(step)
  if (i < 0) return null
  return RESPIRATORY_DEMO_REPLIES[i] ?? null
}
