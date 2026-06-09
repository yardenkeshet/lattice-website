import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { cn } from '../../lib/utils'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

export interface DropdownProps {
  /** Selectable options */
  options: DropdownOption[]
  /** Controlled selected value */
  value?: string
  /** Uncontrolled default value */
  defaultValue?: string
  /** Called with the new value on change */
  onChange?: (value: string) => void
  /** Placeholder shown when no value is selected */
  placeholder?: string
  /** Disables the trigger */
  disabled?: boolean
  /**
   * Direction the popup opens relative to the trigger.
   * 'bottom' = standard dropdown. 'right' = opens to the side.
   */
  side?: 'bottom' | 'right'
  /**
   * Alignment of the popup along the trigger edge.
   * Only meaningful when side='bottom'.
   */
  align?: 'start' | 'center' | 'end'
  /** Override trigger width. Defaults to 100% of its container. */
  width?: number | string
  /** Optional visible label rendered above the trigger */
  label?: string
  className?: string
  'aria-label'?: string
}

// Note: ref is forwarded to SelectPrimitive.Trigger (the focusable element).
const Dropdown = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  DropdownProps
>(
  (
    {
      options,
      value,
      defaultValue,
      onChange,
      placeholder = 'Select…',
      disabled = false,
      side = 'bottom',
      align = 'start',
      width,
      label,
      className,
      'aria-label': ariaLabel,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false)
    const [isHovered, setIsHovered] = React.useState(false)
    const labelId = React.useId()
    // Unique class scopes the item CSS so multiple dropdowns don't clash.
    const scopeId = React.useId().replace(/:/g, '')

    const resolvedWidth =
      width != null
        ? typeof width === 'number' ? `${width}px` : width
        : '100%'

    const triggerState: React.CSSProperties = {
      ...triggerStyle,
      ...(isOpen    ? triggerOpenStyle    : {}),
      ...(isHovered && !isOpen ? triggerHoverStyle : {}),
      ...(disabled  ? triggerDisabledStyle : {}),
    }

    return (
      <div
        className={cn('dropdown-root', className)}
        style={{ display: 'inline-flex', flexDirection: 'column', gap: 'var(--space-sm)', width: resolvedWidth }}
      >
        {label && (
          <span id={labelId} style={labelStyle}>
            {label}
          </span>
        )}

        <SelectPrimitive.Root
          value={value}
          defaultValue={defaultValue}
          onValueChange={onChange}
          disabled={disabled}
          onOpenChange={open => {
            setIsOpen(open)
            // Clear trigger hover highlight when popup opens.
            if (open) setIsHovered(false)
          }}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            aria-labelledby={label ? labelId : undefined}
            aria-label={!label ? ariaLabel : undefined}
            style={triggerState}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon asChild>
              <span style={iconStyle}>
                <ChevronIcon open={isOpen} />
              </span>
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              side={side}
              align={align}
              sideOffset={4}
              style={contentStyle}
              position="popper"
            >
              {/*
                Scoped CSS — targets Radix's data-highlighted attribute.
                Radix sets data-highlighted on the item under the cursor and
                removes it when the cursor moves away. It also highlights the
                selected item automatically when the dropdown first opens.
                No onMouseEnter/onMouseLeave needed on the items.
              */}
              <style>{`
                .dd-item-${scopeId}[data-highlighted] {
                  background-color: var(--bg-tertiary);
                  outline: none;
                }
                .dd-item-${scopeId}[data-disabled] {
                  opacity: 0.4;
                  cursor: not-allowed;
                  pointer-events: none;
                }
              `}</style>

              <SelectPrimitive.Viewport style={viewportStyle}>
                {options.map(opt => (
                  <SelectPrimitive.Item
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className={`dd-item-${scopeId}`}
                    style={itemStyle}
                  >
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </div>
    )
  }
)

Dropdown.displayName = 'Dropdown'

/* ─── Chevron — rotates when open ─── */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transition: 'transform 200ms ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  userSelect: 'none',
}

const triggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  height: 'var(--dropdown-height)',
  padding: '0 4px 0 13px',
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 'var(--radius-button)',
  border: '1px solid transparent',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  color: 'var(--text-base)',
  cursor: 'pointer',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
  userSelect: 'none',
}

const triggerHoverStyle: React.CSSProperties = {
  borderColor: 'var(--border-base)',
}

const triggerOpenStyle: React.CSSProperties = {
  borderColor: 'var(--border-focus)',
}

const triggerDisabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

const iconStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-tertiary)',
  flexShrink: 0,
}

const contentStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--border-base)',
  boxShadow: 'var(--dropdown-shadow)',
  overflow: 'hidden',
  minWidth: 'var(--radix-select-trigger-width)',
  maxHeight: 'var(--radix-select-content-available-height)',
  zIndex: 50,
}

const viewportStyle: React.CSSProperties = {
  padding: '4px',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '7px 12px',
  borderRadius: 'var(--radius-tag)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-xs)',
  fontWeight: 600,
  color: 'var(--text-base)',
  cursor: 'pointer',
  outline: 'none',
  userSelect: 'none',
}

export { Dropdown }
