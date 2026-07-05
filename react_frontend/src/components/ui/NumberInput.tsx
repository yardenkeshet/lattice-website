import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

export interface NumberInputProps {
  /** Controlled value */
  value?: number
  /** Uncontrolled default value */
  defaultValue?: number
  /** Called with the new number whenever it changes */
  onChange?: (value: number) => void
  /** Minimum allowed value */
  min?: number
  /** Maximum allowed value */
  max?: number
  /** Increment / decrement step */
  step?: number
  /**
   * Optional 1-char prefix shown to the left of the value.
   * Accepts a string (e.g. "X") or a small icon element.
   */
  label?: React.ReactNode
  disabled?: boolean
  /** Render the outer wrapper as its child element (Slot / asChild pattern) */
  asChild?: boolean
  /**
   * Override the component width. Accepts a number (px) or any CSS string.
   * Defaults to var(--number-input-width) = 51px (exact Figma spec).
   */
  width?: number | string
  className?: string
  /** Accessible name when no visible label is provided */
  'aria-label'?: string
  id?: string
}

// Note: ref is forwarded to the inner <input> element for focus control.
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      defaultValue = 0,
      onChange,
      min,
      max,
      step = 1,
      label,
      disabled = false,
      asChild = false,
      width,
      className,
      'aria-label': ariaLabel,
      id,
      ...rest
    },
    ref
  ) => {
    const isControlled = value !== undefined

    const [internalValue, setInternalValue] = React.useState<number>(
      isControlled ? (value as number) : defaultValue
    )

    // Sync internal display when parent drives a controlled change.
    React.useEffect(() => {
      if (isControlled) setInternalValue(value as number)
    }, [isControlled, value])

    const [isHovered, setIsHovered] = React.useState(false)
    const [isFocused, setIsFocused] = React.useState(false)

    const clamp = (n: number) => {
      let v = n
      if (min !== undefined) v = Math.max(min, v)
      if (max !== undefined) v = Math.min(max, v)
      return v
    }

    const commit = (next: number) => {
      const clamped = clamp(next)
      setInternalValue(clamped)
      onChange?.(clamped)
    }

    const increment = () => { if (!disabled) commit(internalValue + step) }
    const decrement = () => { if (!disabled) commit(internalValue - step) }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (raw === '' || raw === '-') {
        // Allow empty / in-progress typing without committing yet
        setInternalValue(raw as unknown as number)
        return
      }
      const parsed = parseFloat(raw)
      if (!isNaN(parsed)) commit(parsed)
    }

    const handleBlur = () => {
      setIsFocused(false)
      // Snap to a valid clamped number on blur if field was left empty
      if (typeof internalValue !== 'number' || isNaN(internalValue)) {
        commit(defaultValue)
      } else {
        commit(internalValue)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); increment() }
      if (e.key === 'ArrowDown') { e.preventDefault(); decrement() }
    }

    const Wrapper = asChild ? Slot : 'div'

    const resolvedWidth =
      width != null
        ? typeof width === 'number' ? `${width}px` : width
        : undefined  // no default — wrapper sizes to content

    const containerStyle: React.CSSProperties = {
      ...wrapperStyle,
      ...(resolvedWidth != null ? { width: resolvedWidth } : {}),
      ...(isHovered && !disabled && !isFocused ? hoverStyle : {}),
      ...(isFocused && !disabled ? focusStyle : {}),
      ...(disabled ? disabledStyle : {}),
    }

    return (
      <Wrapper
        className={cn('number-input', className)}
        style={containerStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-disabled={disabled || undefined}
      >
        {label !== undefined && (
          <span style={labelStyle} aria-hidden="true">
            {label}
          </span>
        )}

        {/* Mirror span drives the width; input sits absolutely on top.
            The input is out of flow so it never inflates the container. */}
        <div style={inputWrapperStyle}>
          <span style={inputMirrorStyle} aria-hidden="true">
            {String(internalValue)}
          </span>
          <input
            {...rest}
            ref={ref}
            id={id}
            type="text"
            inputMode="numeric"
            value={internalValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onFocus={(e) => { setIsFocused(true); e.target.select() }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            aria-label={ariaLabel ?? (label ? undefined : 'Number input')}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={typeof internalValue === 'number' ? internalValue : undefined}
            style={inputStyle}
          />
        </div>

        <div style={spinnerStyle} aria-hidden="true">
          <button
            type="button"
            tabIndex={-1}
            onClick={increment}
            disabled={disabled || (max !== undefined && internalValue >= max)}
            style={arrowButtonStyle}
            aria-label="Increase"
          >
            <ChevronUp />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={decrement}
            disabled={disabled || (min !== undefined && internalValue <= min)}
            style={arrowButtonStyle}
            aria-label="Decrease"
          >
            <ChevronDown />
          </button>
        </div>
      </Wrapper>
    )
  }
)

NumberInput.displayName = 'NumberInput'

/* ─── Inline SVG chevrons — no icon library dependency ─── */

function ChevronUp() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 7L5.5 4L8.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 4L5.5 7L8.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  position: 'relative',             /* spinner is absolute inside this */
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: '60px',
  height: 'var(--slider-track-height)',   /* 30px — shared with Slider track */
  /* right padding = edge (3px) + spinner (11px) + gap (6px) = 20px */
  padding: '5px 20px 3px 6px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-track)',    /* 9px — matches Figma exactly */
  border: '1px solid transparent',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease, background-color 150ms ease',
  cursor: 'default',
}

const hoverStyle: React.CSSProperties = {
  borderColor: 'var(--border-base)',
}

const focusStyle: React.CSSProperties = {
  borderColor: 'var(--border-focus)',
}

const disabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',        /* 10px — exact Figma spec */
  fontWeight: 600,
  color: 'var(--text-base)',
  lineHeight: 1,
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

/* Shared font properties for mirror + input — must stay in sync */
const inputFont: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  lineHeight: 1,
}

/* Wrapper: sized by the mirror span; input overlays it absolutely */
const inputWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  minWidth: '1ch',
}

/* Mirror span: invisible, in normal flow — its text width drives the wrapper */
const inputMirrorStyle: React.CSSProperties = {
  ...inputFont,
  visibility: 'hidden',
  whiteSpace: 'pre',
  display: 'block',
  padding: 0,
  userSelect: 'none',
  pointerEvents: 'none',
}

/* Input: absolutely fills the mirror wrapper — never contributes to layout size */
const inputStyle: React.CSSProperties = {
  ...inputFont,
  position: 'absolute',
  inset: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'var(--text-base)',
  width: '100%',
  textAlign: 'center',
  padding: 0,
  cursor: 'text',
}

const spinnerStyle: React.CSSProperties = {
  position: 'absolute',
  right: '3px',
  top: '50%',
  transform: 'translateY(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}

const arrowButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '11px',
  height: '11px',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  lineHeight: 1,
  transition: 'color 100ms ease',
}

export { NumberInput }
