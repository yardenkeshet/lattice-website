import * as React from 'react'
import ReactDOM from 'react-dom'
import { SketchPicker } from 'react-color'
import { cn } from '../../lib/utils'
import { badgeInputStyle } from './Slider'

export interface ColorPickerProps {
  /** Controlled hex color value (e.g. "#f17013") */
  value: string
  /** Called with the new hex color whenever it changes */
  onChange: (value: string) => void
  /** Optional visible label rendered above the swatch */
  label?: string
  disabled?: boolean
  /** Hide the alpha slider in the popover — value is a plain hex string */
  disableAlpha: boolean
  className?: string
  /** Accessible name when no visible label is provided */
  'aria-label'?: string
}

// Note: ref is forwarded to the swatch <button> (the focusable element).
const ColorPicker = React.forwardRef<HTMLButtonElement, ColorPickerProps>(
  (
    {
      value,
      onChange,
      label,
      disabled = false,
      disableAlpha = true,
      className,
      'aria-label': ariaLabel,
    },
    ref
  ) => {

    const [internalValue, setInternalValue] = React.useState<string>(value)

    // Sync swatch when parent drives a controlled change.
    React.useEffect(() => {
     setInternalValue(value as string)
    }, [value])

    const [isOpen, setIsOpen] = React.useState(false)
    const [isHovered, setIsHovered] = React.useState(false)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const popoverRef = React.useRef<HTMLDivElement>(null)
    const swatchRef = React.useRef<HTMLButtonElement | null>(null)
    const labelId = React.useId()

    const [badgeHovered, setBadgeHovered] = React.useState(false)
    const [badgeFocused, setBadgeFocused] = React.useState(false)

    // Portal target is rendered with viewport (fixed) coordinates computed from
    // the swatch's bounding rect, so it escapes any ancestor's overflow:hidden/auto
    // clipping instead of relying on a CSS-only position:absolute fix.
    const [popoverPos, setPopoverPos] = React.useState<{ top?: number; bottom?: number; left?: number; right?: number }>({})

    React.useEffect(() => {
      if (!isOpen || !swatchRef.current) return

      const rect = swatchRef.current.getBoundingClientRect()
      const pickerH = 320
      const pickerW = 220

      const openUp = window.innerHeight - rect.bottom < pickerH
      const openLeft = window.innerWidth - rect.right < pickerW

      setPopoverPos({
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
        left: openLeft ? undefined : rect.left,
        right: openLeft ? window.innerWidth - rect.right : undefined,
      })
    }, [isOpen])

    // react-color has no built-in dismiss behavior — close on outside click / Escape.
    React.useEffect(() => {
      if (!isOpen) return

      const handlePointerDown = (e: MouseEvent) => {
        const target = e.target as Node
        if (!containerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
          setIsOpen(false)
        }
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false)
      }

      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handlePointerDown)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }, [isOpen])

    const commit = (next: string) => {
      setInternalValue(next)
      onChange?.(next)
    }

    const swatchState: React.CSSProperties = {
      ...swatchStyle,
      backgroundColor: internalValue,
      ...((isHovered || isOpen) && !disabled ? swatchActiveStyle : {}),
      ...(disabled ? swatchDisabledStyle : {}),
    }

    return (
      <div
        ref={containerRef}
        className={cn('color-picker-root', className)}
        style={wrapperStyle}
      >
        {label && (
          <span id={labelId} style={labelStyle}>
            {label}
          </span>
        )}

        <button
          ref={el => {
            swatchRef.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          type="button"
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          style={swatchState}
          onClick={() => setIsOpen(o => !o)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        />
        {/* text input */}
        <input
                style={{
                  ...badgeInputStyle,
                  borderColor: badgeFocused
                    ? 'var(--border-focus)'
                    : badgeHovered
                    ? 'var(--border-base)'
                    : 'transparent',
                  // ...(error ? { color: 'var(--text-error)' } : {}),
                }}
                value={"#" + value.replaceAll("#",'')}
                onChange={e => onChange("#" + e.target.value.replace(/[^a-z0-9]/gi, ""))}
                onMouseEnter={() => setBadgeHovered(true)}
                onMouseLeave={() => setBadgeHovered(false)}
                onFocus={e => { setBadgeFocused(true); e.target.select() }}
                // onBlur={() => { inputFocused.current = false; setBadgeFocused(false); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                aria-label={label ? `${label} value` : 'slider value'}
              />
        {isOpen && ReactDOM.createPortal(
          <div ref={popoverRef} style={{ ...popoverStyle, ...popoverPos }}>
            {/* <ChromePicker
              color={internalValue}
              disableAlpha={true}
              onChange={(color: { hex: string }) => commit(color.hex)}

            /> */}
            <SketchPicker
              color={internalValue}
              disableAlpha={disableAlpha}
              onChange={(color: { hex: string }) => commit(color.hex)}
            />
          </div>,
          document.body // renders outside all overflow:hidden ancestors
        )}
      </div>
    )
  }
)

ColorPicker.displayName = 'ColorPicker'

/* ─── Styles — all values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  flexDirection: 'column',
  gap: 'var(--space-sm)',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  userSelect: 'none',
}

const swatchStyle: React.CSSProperties = {
  width: '36px',
  height: '20px',
  padding: 0,
  borderRadius: 'var(--radius-tag)',
  border: '1px solid var(--border-base)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
  flexShrink: 0,
}

const swatchActiveStyle: React.CSSProperties = {
  borderColor: 'var(--border-focus)',
}

const swatchDisabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

const popoverStyle: React.CSSProperties = {
  position: 'fixed', // key change — works with viewport coords from getBoundingClientRect
  zIndex: 9999,
}

export { ColorPicker }
