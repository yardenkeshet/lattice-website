import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Show a numeric readout badge beside the track */
  showValue?: boolean
  /** Decimal places shown in the value badge */
  valuePrecision?: number
  /** Optional label rendered above the slider */
  label?: string
  /** Render the root wrapper as its child element (Slot pattern) */
  asChild?: boolean
  /** Width of the slider track (e.g. 200, '100%', '12rem'). Defaults to 100% of its container. */
  length?: number | string
  /**
   * Formats the thumb aria-valuetext for screen readers.
   * Useful for domain-specific units e.g. (v) => `${v} tiles`
   */
  getValueText?: (value: number) => string
  /** Called when the user finishes interacting (mouse up / key up / badge commit). */
  onValueCommit?: (value: number[]) => void
  /** Override the label font size (defaults to var(--text-size-body)). */
  fontSize?: string | number
}

// Note: ref is forwarded to SliderPrimitive.Root (the focusable/interactive
// element), not the outer wrapper div. Use a callback ref on the wrapper if
// you need its bounding rect.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      showValue = false,
      valuePrecision = 2,
      label,
      asChild = false,
      length,
      fontSize,
      min = 0,
      max = 1,
      step = 0.01,
      defaultValue,
      value,
      disabled,
      onValueChange,
      onValueCommit,
      getValueText,
      ...props
    },
    ref
  ) => {
    // [C1] displayValue tracks what to show in the badge only.
    // value/defaultValue are passed straight through to Radix, which owns the
    // controlled/uncontrolled contract. We never duplicate Radix's state.
    const [displayValue, setDisplayValue] = React.useState<number[]>(
      value ?? defaultValue ?? [min]
    )

    // Sync badge when parent drives a controlled value change.
    React.useEffect(() => {
      if (value !== undefined) setDisplayValue(value)
    }, [value])

    const handleValueChange = (next: number[]) => {
      setDisplayValue(next)
      onValueChange?.(next)
    }

    // Editable badge state — tracks the raw string while the user is typing.
    const [inputStr, setInputStr] = React.useState(
      (value ?? defaultValue ?? [min])[0].toFixed(valuePrecision)
    )
    const inputFocused = React.useRef(false)

    // Keep input in sync with slider thumb movement (skip when user is typing).
    React.useEffect(() => {
      if (!inputFocused.current) {
        setInputStr((displayValue[0] ?? min).toFixed(valuePrecision))
      }
    }, [displayValue, valuePrecision, min])

    const commitInput = () => {
      const parsed = parseFloat(inputStr)
      const clamped = isNaN(parsed)
        ? (displayValue[0] ?? min)
        : Math.min(max, Math.max(min, parsed))
      setInputStr(clamped.toFixed(valuePrecision))
      setDisplayValue([clamped])
      onValueChange?.([clamped])
      onValueCommit?.([clamped])
    }

    // [C2] State-driven hover — no direct DOM mutation.
    const [hoveredThumb, setHoveredThumb] = React.useState<number | null>(null)
    const [badgeHovered, setBadgeHovered] = React.useState(false)
    const [badgeFocused, setBadgeFocused] = React.useState(false)

    // [R1] Associate the visible label with the Radix root via aria-labelledby.
    const labelId = React.useId()

    const Wrapper = asChild ? Slot : 'div'

    const wrapperWidth =
      length != null
        ? typeof length === 'number'
          ? `${length}px`
          : length
        : '100%'

    return (
      <>
        <Wrapper
          className={cn('slider-root', className)}
          style={{ ...wrapperStyle, width: wrapperWidth }}
        >
          {label && (
            <span id={labelId} style={{ ...labelStyle, ...(fontSize != null ? { fontSize } : {}) }}>
              {label}
            </span>
          )}

          <div style={rowStyle}>
            {/* [C1] value and defaultValue passed directly — Radix owns the state. */}
            <SliderPrimitive.Root
              ref={ref}
              min={min}
              max={max}
              step={step}
              value={value}
              defaultValue={defaultValue ?? (value === undefined ? [min] : undefined)}
              disabled={disabled}
              onValueChange={handleValueChange}
              onValueCommit={onValueCommit}
              aria-labelledby={label ? labelId : undefined}
              style={rootStyle(disabled)}
              {...props}
            >
              <SliderPrimitive.Track style={trackStyle}>
                <SliderPrimitive.Range style={rangeStyle} />
              </SliderPrimitive.Track>

              {displayValue.map((v, i) => (
                <SliderPrimitive.Thumb
                  key={`thumb-${i}`}
                  className="slider-thumb"
                  aria-valuetext={getValueText ? getValueText(v) : undefined}
                  style={
                    hoveredThumb === i && !disabled
                      ? thumbHoverStyle
                      : thumbBaseStyle
                  }
                  onMouseEnter={() => setHoveredThumb(i)}
                  onMouseLeave={() => setHoveredThumb(null)}
                />
              ))}
            </SliderPrimitive.Root>

            {showValue && displayValue.length === 1 && (
              <input
                style={{
                  ...badgeInputStyle,
                  borderColor: badgeFocused
                    ? 'var(--border-focus)'
                    : badgeHovered
                    ? 'var(--border-base)'
                    : 'transparent',
                }}
                value={inputStr}
                onChange={e => setInputStr(e.target.value)}
                onMouseEnter={() => setBadgeHovered(true)}
                onMouseLeave={() => setBadgeHovered(false)}
                onFocus={e => { inputFocused.current = true; setBadgeFocused(true); e.target.select() }}
                onBlur={() => { inputFocused.current = false; setBadgeFocused(false); commitInput() }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                aria-label={label ? `${label} value` : 'slider value'}
              />
            )}
            {showValue && displayValue.length > 1 && (
              <div style={badgeRangeStyle}>
                {displayValue.map(v => v.toFixed(valuePrecision)).join(' – ')}
              </div>
            )}
          </div>
        </Wrapper>
      </>
    )
  }
)

Slider.displayName = 'Slider'

/* ─── Styles — all values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-sm)',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-body)',
  fontWeight: 500,
  color: 'var(--text-secondary)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-sm)',
  width: '100%',
}

const rootStyle = (disabled?: boolean): React.CSSProperties => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flexGrow: 1,
  userSelect: 'none',
  touchAction: 'none',
  opacity: disabled ? 0.45 : 1,
  cursor: disabled ? 'not-allowed' : 'default',
})

const trackStyle: React.CSSProperties = {
  position: 'relative',
  flexGrow: 1,
  height: 'var(--slider-track-height)',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-track)',
  overflow: 'hidden',
}

const rangeStyle: React.CSSProperties = {
  position: 'absolute',
  height: '100%',
  backgroundColor: 'var(--gray-400)',
}

const thumbBaseStyle: React.CSSProperties = {
  display: 'block',
  width: 'var(--slider-thumb-width)',
  height: 'var(--slider-thumb-height)',
  backgroundColor: 'var(--bg-primary)',
  border: '2px solid var(--border-base)',
  borderRadius: 'var(--radius-thumb)',
  boxShadow: 'var(--shadow-thumb)',
  cursor: 'grab',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  // [C3] outline removed here — focus ring is handled by .slider-thumb:focus-visible
}

const thumbHoverStyle: React.CSSProperties = {
  ...thumbBaseStyle,
  borderColor: 'var(--action-primary)',
  boxShadow: 'var(--shadow-thumb-hover)',
}

const badgeStyle: React.CSSProperties = {
  width: 'var(--slider-badge-width)',
  flexShrink: 0,
  padding: '0 10px',
  height: 'var(--slider-track-height)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-track)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-sm)',
  fontWeight: 500,
  color: 'var(--text-base)',
  whiteSpace: 'nowrap',
}

const badgeRangeStyle: React.CSSProperties = {
  ...badgeStyle,
  width: 'var(--slider-badge-width-range)',
}

const badgeInputStyle: React.CSSProperties = {
  ...badgeStyle,
  border: '1px solid transparent',
  outline: 'none',
  cursor: 'text',
  textAlign: 'center',
  padding: '0 4px',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
}

export { Slider }
