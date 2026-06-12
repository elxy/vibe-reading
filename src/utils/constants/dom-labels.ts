export const CONTENT_WRAPPER_CLASS = "vibe-reading-translated-content-wrapper"
export const INLINE_CONTENT_CLASS = "vibe-reading-translated-inline-content"
export const BLOCK_CONTENT_CLASS = "vibe-reading-translated-block-content"
export const FLOAT_WRAP_ATTRIBUTE = "data-vibe-reading-float-wrap"

export const WALKED_ATTRIBUTE = "data-vibe-reading-walked"
// paragraph means you need to trigger translation on this element (i.e. we have inline children in it)
export const PARAGRAPH_ATTRIBUTE = "data-vibe-reading-paragraph"
export const BLOCK_ATTRIBUTE = "data-vibe-reading-block-node"
export const INLINE_ATTRIBUTE = "data-vibe-reading-inline-node"

export const TRANSLATION_MODE_ATTRIBUTE = "data-vibe-reading-translation-mode"

export const MARK_ATTRIBUTES = new Set([WALKED_ATTRIBUTE, PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, INLINE_ATTRIBUTE])

export const NOTRANSLATE_CLASS = "notranslate"

export const REACT_SHADOW_HOST_CLASS = "vibe-reading-react-shadow-host"

export const TRANSLATION_ERROR_CONTAINER_CLASS = "vibe-reading-translation-error-container"
