import { newId } from '../lib/id'
import { buildClinicalBrief } from './brief'
import {
    applyStepToState,
    createEmptyIntakeState,
    initRosLines,
} from './extract'
import { buildLiveBrief, createEmptyLiveBrief } from './liveBrief'
import {
    INTAKE_STEPS,
    type ClinicalBrief,
    type IntakeSession,
    type IntakeState,
    type IntakeStep,
    type Message,
} from './types'

export type { IntakeSession } from './types'

const WELCOME_TEXT = [
  "Hi — I’m a **pre-visit intake assistant** (this is a simulation, not emergency care; call 911 if you have a medical emergency).",
  "I’ll ask a few focused questions so your clinician can see a **structured brief (CC, HPI, ROS)** at the end.",
  "**In one or two sentences, what is the main reason for your visit today?** (Chief complaint.)",
].join('\n\n')

function nextOf(step: IntakeStep): IntakeStep {
  const i = INTAKE_STEPS.indexOf(step)
  if (i < 0 || i >= INTAKE_STEPS.length - 1) return 'complete'
  return INTAKE_STEPS[i + 1]
}

function stepQuestion(step: IntakeStep, intake: IntakeState): string {
  switch (step) {
    case 'onset':
      return '**When** did this start? (e.g. sudden vs gradual, and roughly what day or time if you know.)'
    case 'duration':
      return '**How long** has this been going on? (e.g. hours, days, constant vs intermittent.)'
    case 'severity':
      return '**How bad** is it? You can use a 0–10 scale or your own words (mild/moderate/severe).'
    case 'location':
      return '**Where** is it located, and does it **radiate** anywhere else?'
    case 'quality':
      return '**What does it feel like?** (aching, sharp, pressure, burning, etc.)'
    case 'modifiers':
      return '**What makes it better or worse?** (movement, rest, food, time of day, medications, etc.)'
    case 'associated':
      return '**Any other symptoms** that go along with it? (Fever, nausea, cough, etc.)'
    case 'red_flags':
      return (
        '**Urgent check:** Any of the **following** right now: chest pain/pressure, trouble breathing, one-sided weakness or slurred speech, "worst headache of your life", or fainting? ' +
        'Please answer briefly; if you’re not sure, describe what you feel.'
      )
    case 'ros_focus_1': {
      const l = intake.ros[0]
      if (!l) {
        return '**Focused review (part 1):** Any other symptoms in the problem area? (If none, you can say “no”).'
      }
      return `**Review of systems (focused) — 1/2** — considering your chief complaint, any of the following: *${l.system}*? (Yes/No, or a short list.)`
    }
    case 'ros_focus_2': {
      const l = intake.ros[1]
      if (!l) {
        return '**Focused review (part 2):** anything else?'
      }
      return `**Review of systems (focused) — 2/2** — *${l.system}*? (Yes/No, or a short list.)`
    }
    case 'ros_general': {
      const l = intake.ros[2]
      if (!l) {
        return '**General review:** any fevers, chills, night sweats, weight change, fatigue, or appetite change? (Brief.)'
      }
      return `**General review of systems** — *${l.system}*? (You can also say you’re unsure or say “no.”)`
    }
    case 'meds':
      return '**What medications** do you take (including over-the-counter and supplements)? If none, say "none."'
    case 'allergies':
      return '**Any drug allergies?** (And reaction type if you know, e.g. rash vs anaphylaxis.) If none, say "none."'
    case 'wrap_up':
      return '**Is there anything else** your clinician should know before the visit, or that we did not cover?'
    case 'complete': {
      return '**Your intake is complete.** The structured brief is shown in the right panel. Thank you for your time today.'
    }
    default:
      return ''
  }
}

export function createInitialSession(): IntakeSession {
  const m: Message = { id: newId(), role: 'agent', content: WELCOME_TEXT, ts: Date.now() }
  return {
    messages: [m],
    step: 'cc',
    intake: createEmptyIntakeState(),
    complete: false,
    brief: null,
    liveBrief: createEmptyLiveBrief(),
  }
}

/**
 * After `userText` in `session.step` is applied, move to the next step and return new agent content.
 */
export function submitUserMessage(
  session: IntakeSession,
  userText: string,
): IntakeSession {
  const trimmed = userText.trim()
  if (!trimmed) return session
  if (session.complete) return session

  const { step } = session
  if (step === 'complete') return session

  const userMsg: Message = { id: newId(), role: 'user', content: trimmed, ts: Date.now() }
  const intake: IntakeState = structuredClone(session.intake) ?? createEmptyIntakeState()

  applyStepToState(step, trimmed, intake)

  if (step === 'red_flags' && intake.ros.length === 0) {
    intake.ros = initRosLines(intake.hpi.theme, intake.hpi)
  }

  const newStep: IntakeStep = nextOf(step)

  const brief: ClinicalBrief | null =
    newStep === 'complete' ? buildClinicalBrief(intake) : null
  const complete = newStep === 'complete'
  const liveBrief = buildLiveBrief(intake, session.liveBrief, step)

  const agentParts: string[] = []
  if (newStep !== 'complete') {
    const q = stepQuestion(newStep, intake)
    if (q) {
      agentParts.push(`Thanks — I’ve noted that.\n\n${q}`)
    }
  } else {
    agentParts.push(
      "You’re all set. I’ve **compiled a pre-visit brief (CC, HPI, ROS)** in the right-hand panel. Your clinician can refine this in person.",
    )
  }

  const agentContent = agentParts.join('\n\n')
  const newMessages: Message[] = [
    ...session.messages,
    userMsg,
    ...(agentContent
      ? [{ id: newId(), role: 'agent' as const, content: agentContent, ts: Date.now() }]
      : []),
  ]

  return {
    step: newStep,
    messages: newMessages,
    intake,
    complete,
    brief,
    liveBrief,
  }
}

/**
 * Recompute brief from current intake (e.g. after “reset” not needed) — for exports/tests.
 */
export function computeBrief(s: IntakeState): ClinicalBrief {
  return buildClinicalBrief(s)
}
