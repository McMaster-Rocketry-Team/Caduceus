import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import tailwindCSS from '../tailwind.css?inline'

const sheet = new CSSStyleSheet()
sheet.replaceSync(tailwindCSS)

if (import.meta.hot) {
  import.meta.hot.accept('../tailwind.css?inline', (mod) => {
    sheet.replaceSync((mod as { default: string } | undefined)?.default ?? '')
  })
}

/**
 * Mounts a React component inside a Shadow DOM attached to `element`,
 * with Tailwind CSS scoped to the shadow root so it won't clash with
 * OpenMCT's global styles.
 *
 * @param element The host element to attach the shadow root to
 * @param component The React element to render
 * @returns A cleanup function that unmounts the React tree
 */
export function mountReactInShadow(
  element: HTMLElement,
  component: ReactNode
): () => void {
  // attachShadow throws if the element already hosts a shadow tree, and a
  // shadow root can never be detached. OpenMCT reuses view container elements
  // across show()/destroy() cycles, so reuse an existing root when present.
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
  shadow.adoptedStyleSheets = [sheet]

  const mountPoint = document.createElement('div')
  shadow.replaceChildren(mountPoint)

  const root = createRoot(mountPoint)
  root.render(component)

  return () => {
    root.unmount()
    mountPoint.remove()
  }
}
