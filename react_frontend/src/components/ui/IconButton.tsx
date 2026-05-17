import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * The icon to display — pass any SVG element or icon component.
   * Should be 14×14px to match the Figma spec.
   */
  children: React.ReactNode
  /** Required: screen-reader label for the action (no visible text) */
  'aria-label': string
  /** Render the inner button as its child element (Slot / asChild pattern) */
  asChild?: boolean
  className?: string
}

// Note: ref is forwarded to the inner <button> element.
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, disabled = false, asChild = false, className, onClick, ...rest }, ref) => {
    const [isHovered, setIsHovered] = React.useState(false)

    const Comp = asChild ? Slot : 'button'

    return (
      /* Outer hit/glow area */
      <div style={outerStyle}>
        {/* Inner visible button */}
        <Comp
          ref={ref}
          type={asChild ? undefined : 'button'}
          disabled={disabled}
          onClick={onClick}
          className={cn('icon-button', className)}
          style={{
            ...innerStyle,
            ...(isHovered && !disabled ? innerHoverStyle : {}),
            ...(disabled ? innerDisabledStyle : {}),
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          {...rest}
        >
          <span style={iconWrapStyle} aria-hidden="true">
            {children}
          </span>
        </Comp>
      </div>
    )
  }
)

IconButton.displayName = 'IconButton'

/* ─── Styles — all values reference design tokens ─── */

const outerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--icon-btn-hit)',
  height: 'var(--icon-btn-hit)',
  borderRadius: 'var(--icon-btn-radius)',
  backgroundColor: 'var(--icon-btn-glow)',   /* #fdfdfd — always visible */
  boxShadow: 'var(--icon-btn-shadow-outer)', /* 1px 2px 9px 2px rgba(0,0,0,0.10) */
  flexShrink: 0,
}

const innerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--icon-btn-size)',
  height: 'var(--icon-btn-size)',
  borderRadius: 'var(--radius-button)',
  backgroundColor: 'var(--icon-btn-bg)',
  border: 'none',
  color: 'var(--text-base)',
  cursor: 'pointer',
  outline: 'none',
  padding: 0,
  transition: 'background-color 150ms ease, border-color 150ms ease',
  boxSizing: 'border-box',
  flexShrink: 0,
}

const innerHoverStyle: React.CSSProperties = {
  backgroundColor: 'var(--icon-btn-bg-hover)',
  borderColor: 'var(--border-base)',
}

const innerDisabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

const iconWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'var(--icon-md)',    /* 24px — scales icon to button */
  height: 'var(--icon-md)',
  pointerEvents: 'none',
}

export { IconButton }
