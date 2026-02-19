import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'

export type TaskCardTransitionClone = {
  key: string
  style: CSSProperties
  content: ReactNode
}

export type TaskCardTransitionLayerProps = {
  clone: TaskCardTransitionClone | null
  backdropVisible?: boolean
}

/**
 * Fixed-position portal layer for shared-element transitions.
 * Intentionally pointer-events:none so it never blocks interaction.
 */
export function TaskCardTransitionLayer({ clone, backdropVisible }: TaskCardTransitionLayerProps) {
  if (!clone && !backdropVisible) return null

  return createPortal(
    <div className="task-transition-layer" aria-hidden="true">
      <div className={`task-transition-backdrop ${backdropVisible ? 'visible' : ''}`} />
      {clone ? (
        <div className="task-transition-clone" style={clone.style} data-clone-key={clone.key}>
          {clone.content}
        </div>
      ) : null}
    </div>,
    document.body
  )
}



