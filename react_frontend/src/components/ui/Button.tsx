import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 'primary' — navy background, white text.
   * 'secondary' — light gray background, dark text. Matches Figma "Export" button.
   */
  variant?: 'primary' | 'secondary'
  /** Icon rendered to the left of the label */
  leftIcon?: React.ReactNode
  /** Icon rendered to the right of the label */
  rightIcon?: React.ReactNode
  /** Render as child element (Slot / asChild pattern) */
  asChild?: boolean
  children?: React.ReactNode
}

// Note: ref is forwarded to the underlying <button> element.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      leftIcon,
      rightIcon,
      asChild = false,
      disabled = false,
      className,
      children,
      onClick,
      ...rest
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false)

    const Comp = asChild ? Slot : 'button'

    const computedStyle: React.CSSProperties = {
      ...baseStyle,
      ...(variant === 'primary' ? primaryStyle : secondaryStyle),
      ...(isHovered && !disabled
        ? variant === 'primary'
          ? primaryHoverStyle
          : secondaryHoverStyle
        : {}),
      ...(disabled ? disabledStyle : {}),
    }

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : 'button'}
        disabled={disabled}
        className={cn('btn', `btn-${variant}`, className)}
        style={computedStyle}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...rest}
      >
        {leftIcon && (
          <span style={iconStyle} aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children && <span>{children}</span>}
        {rightIcon && (
          <span style={iconStyle} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </Comp>
    )
  }
)

Button.displayName = 'Button'

/* ─── Styles — all values reference design tokens ─── */

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--btn-gap)',
  height: 'var(--btn-height)',
  padding: 'var(--btn-padding-y) var(--btn-padding-x)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-button)',
  fontWeight: 600,
  lineHeight: 1,
  boxShadow: 'var(--btn-shadow)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
  flexShrink: 0,
}

/* ── Secondary (Figma "Export" style) ── */
const secondaryStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-base)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
}

const secondaryHoverStyle: React.CSSProperties = {
  backgroundColor: 'var(--gray-100)',
  // borderColor: 'color-mix(in srgb, var(--gray-400) 50%, transparent)',
}

/* ── Primary ── */
const primaryStyle: React.CSSProperties = {
  backgroundColor: 'var(--action-primary)',
  color: 'var(--action-primary-text)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
}

const primaryHoverStyle: React.CSSProperties = {
  backgroundColor: 'var(--action-primary-hover)',
}

/* ── Shared states ── */
const disabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

const iconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

export { Button }
