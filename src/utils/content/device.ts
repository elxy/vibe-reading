const MOBILE_BREAKPOINT = 768

const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i

export function isMobileLikeDevice(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false
  const hasSmallViewport = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
    ?? window.innerWidth < MOBILE_BREAKPOINT
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent

  return (hasCoarsePointer && hasSmallViewport) || MOBILE_USER_AGENT_PATTERN.test(userAgent)
}

export function resolveFloatingTranslateButtonEnabled(value: boolean | null | undefined): boolean {
  return value ?? isMobileLikeDevice()
}
