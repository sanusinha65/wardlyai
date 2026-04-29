/**
 * Message/session ids; avoids relying on global crypto in all environments.
 */
let _seq = 0
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  _seq += 1
  return `m_${Date.now()}_${_seq}`
}
