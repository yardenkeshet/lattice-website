import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Slot } from '@radix-ui/react-slot'

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
}

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
      min = 0,
      max = 1,
      step = 0.01,
      defaultValue,
      value,
      disabled,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<number[]>(
      value ?? defaultValue ?? [min]
    )

    const currentValue = value ?? internalValue

    const handleValueChange = (next: number[]) => {
      setInternalValue(next)
      onValueChange?.(next)
    }

    const Wrapper = asChild ? Slot : 'div'

    return (
      <Wrapper className={['slider-root', className].filter(Boolean).join(' ')} style={sliderWrapperStyle}>
        {label && (
          <span style={labelStyle}>
            {label}
          </span>
        )}
        <div style={rowStyle}>
          <SliderPrimitive.Root
            ref={ref}
            min={min}
            max={max}
            step={step}
            value={currentValue}
            disabled={disabled}
            onValueChange={handleValueChange}
            style={rootStyle(disabled)}
            {...props}
          >
            <SliderPrimitive.Track style={trackStyle}>
              <SliderPrimitive.Range style={rangeStyle} />
            </SliderPrimitive.Track>

            {currentValue.map((_, i) => (
              <SliderPrimitive.Thumb
                key={i}
                aria-label={label ?? 'Slider'}
                style={thumbStyle}
                onMouseEnter={e => {
                  if (!disabled) Object.assign((e.target as HTMLElement).style, thumbHoverStyle)
                }}
                onMouseLeave={e => {
                  Object.assign((e.target as HTMLElement).style, thumbStyle)
                }}
              />
            ))}
          </SliderPrimitive.Root>

          {showValue && (
            <div style={badgeStyle}>
              {currentValue.map(v => v.toFixed(valuePrecision)).join(' – ')}
            </div>
          )}
        </div>
      </Wrapper>
    )
  }
)

Slider.displayName = 'Slider'

/* ─── Styles (all values reference design tokens) ─── */

const sliderWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-sm)',
  width: '100%',
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
  height: '30px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
}

const rangeStyle: React.CSSProperties = {
  position: 'absolute',
  height: '100%',
  backgroundColor: 'var(--gray-400)',
  borderRadius: 'var(--radius-full)',
}

const thumbStyle: React.CSSProperties = {
  display: 'block',
  width: '22px',
  height: '35px',
  backgroundColor: 'var(--bg-primary)',
  border: '2px solid var(--border-base)',
  borderRadius: '5px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  cursor: 'grab',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  outline: 'none',
}

const thumbHoverStyle: React.CSSProperties = {
  ...thumbStyle,
  borderColor: 'var(--action-primary)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
}

const badgeStyle: React.CSSProperties = {
  minWidth: '48px',
  padding: '6px 10px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-card)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-base)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

export { Slider }
