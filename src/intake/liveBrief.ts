import type { IntakeState, IntakeStep, LiveBrief } from './types'

export function createEmptyLiveBrief(): LiveBrief {
  return {
    demographics: null,
    cc: null,
    hpiFragments: {
      onset: null,
      duration: null,
      severity: null,
      location: null,
      quality: null,
      modifiers: null,
      associatedSymptoms: null,
    },
    rosProgress: [],
    redFlags: null,
  }
}

export function hasAnyHpiFragments(live: LiveBrief): boolean {
  const f = live.hpiFragments
  return Boolean(
    f.onset ||
      f.duration ||
      f.severity ||
      f.location ||
      f.quality ||
      f.modifiers ||
      f.associatedSymptoms,
  )
}

/**
 * Fold the step that was just answered into the live brief snapshot.
 */
export function buildLiveBrief(
  intake: IntakeState,
  current: LiveBrief,
  justCompletedStep: IntakeStep,
): LiveBrief {
  const next: LiveBrief = {
    ...current,
    hpiFragments: { ...current.hpiFragments },
    rosProgress: [...current.rosProgress],
  }

  switch (justCompletedStep) {
    case 'personal_info': {
      const d = intake.demographics
      const hasAny = Boolean(d.name || d.ageNumber != null || d.sex || d.ageRaw || d.sexRaw)
      next.demographics = hasAny ? { ...d } : null
      break
    }
    case 'cc':
      next.cc = intake.hpi.chiefComplaint.trim() || null
      break
    case 'onset':
      next.hpiFragments.onset = intake.hpi.onset.trim() || null
      break
    case 'duration':
      next.hpiFragments.duration = intake.hpi.duration.trim() || null
      break
    case 'severity':
      next.hpiFragments.severity = intake.hpi.severity.trim() || null
      break
    case 'location':
      next.hpiFragments.location = intake.hpi.location.trim() || null
      break
    case 'quality':
      next.hpiFragments.quality = intake.hpi.quality.trim() || null
      break
    case 'modifiers':
      next.hpiFragments.modifiers = intake.hpi.modifiers.trim() || null
      break
    case 'associated':
      next.hpiFragments.associatedSymptoms = intake.hpi.associatedSymptoms.trim() || null
      break
    case 'red_flags':
      next.redFlags = intake.redFlags.trim() || null
      break
    case 'ros_focus_1':
    case 'ros_focus_2':
    case 'ros_general':
      next.rosProgress = intake.ros.map((r) => ({
        system: r.system.split(':')[0]?.trim() || r.system.slice(0, 48),
        status:
          r.positives.length > 0 || r.negatives.length > 0
            ? ('completed' as const)
            : ('pending' as const),
      }))
      break
    default:
      break
  }

  return next
}
