let hovercardAppendTarget: HTMLElement | null = null

export function getHovercardAppendTarget(): HTMLElement {
  return hovercardAppendTarget ?? document.body
}

export function setHovercardAppendTarget(target: HTMLElement | null): void {
  hovercardAppendTarget = target
}

/** @internal test helper */
export function resetHovercardAppendTargetForTests(): void {
  hovercardAppendTarget = null
}
