/**
 * Pluralise a count for the queue tracker's labels and progress strings.
 *
 * ponytail: naive `+ 's'` suffixing, matching every call site it replaces.
 * Swap for `Intl.PluralRules` if RGP ever ships a non-English locale.
 */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Mint a queue process id. The `prefix` names the verb so the queue tracker
 * (and the logs) can tell concurrent runs apart at a glance.
 *
 * Lives here rather than in `queue.ts` so that leaf consumers like
 * `toast-store` don't pull the Effect queue machinery in behind it.
 */
export function newProcessId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
