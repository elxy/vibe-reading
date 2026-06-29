export function shouldTranslateSmartParagraph(element: HTMLElement) {
  const text = element.textContent?.trim() ?? ""
  const isBad = element.closest("nav, header, footer, aside, .toc, .related, .newsletter")
  return {
    shouldTranslate: Boolean(text) && !isBad,
    forced: false,
    reason: isBad ? "mock-skip" : "mock-pass",
  }
}
