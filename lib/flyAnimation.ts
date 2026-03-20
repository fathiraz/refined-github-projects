export function flyToTracker(startRect: DOMRect): void {
  const orb = document.createElement('div')
  const size = 22
  const startX = startRect.left + startRect.width / 2 - size / 2
  const startY = startRect.top + startRect.height / 2 - size / 2
  // Target: center of QueueTracker card (right: 20, bottom: 96, width: 320px)
  const targetX = window.innerWidth - 20 - 160 - size / 2
  const targetY = window.innerHeight - 96 - 44 - size / 2

  orb.style.cssText = `
    position: fixed;
    left: ${startX}px; top: ${startY}px;
    width: ${size}px; height: ${size}px;
    border-radius: 50%;
    background: var(--color-accent-emphasis, #0969da);
    z-index: 999999;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(9,105,218,0.45);
  `
  document.body.appendChild(orb)

  const dx = targetX - startX
  const dy = targetY - startY

  orb.animate([
    { transform: 'translate(0,0) scale(1)',                                opacity: 1,   offset: 0    },
    { transform: `translate(${dx * 0.6}px,${dy * 0.25}px) scale(0.75)`,  opacity: 0.9, offset: 0.45 },
    { transform: `translate(${dx}px,${dy}px) scale(0.3)`,                 opacity: 0,   offset: 1    },
  ], { duration: 520, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' })
    .onfinish = () => orb.remove()
}
