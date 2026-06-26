// react_frontend/src/components/ui/Tooltip.tsx
import * as React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })
  const triggerRef = React.useRef<HTMLDivElement>(null)

  const show = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    })
    setVisible(true)
  }

  const hide = () => setVisible(false)

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'contents' }}>
      {children}
      {visible && typeof document !== 'undefined' &&
        React.createPortal(
          <div style={tooltipStyle(coords)}>
            {content}
          </div>,
          document.body
        )
      }
    </div>
  )
}

function tooltipStyle(coords: { top: number; left: number }): React.CSSProperties {
  return {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    transform: 'translate(-50%, -100%)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-base)',
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    lineHeight: 1.55,
    padding: '7px 11px',
    borderRadius: 8,
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    maxWidth: 280,
    whiteSpace: 'pre-line',
    zIndex: 9999,
    pointerEvents: 'none',
  }
}
