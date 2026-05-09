import * as React from 'react'
import { cn } from '../../lib/utils'

export interface NavbarProps extends React.HTMLAttributes<HTMLElement> {
  /** Which page is currently active — controls the white indicator position. */
  activePage: 'home' | 'tool'
  /** Called when a nav link is clicked. */
  onNavigate?: (page: 'home' | 'tool') => void
}

const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
  ({ activePage, onNavigate, className, ...rest }, ref) => {
    const homeRef = React.useRef<HTMLButtonElement>(null)
    const toolRef = React.useRef<HTMLButtonElement>(null)
    const stripeRef = React.useRef<HTMLDivElement>(null)
    const [indicatorLeft, setIndicatorLeft] = React.useState<number | null>(null)
    const [indicatorWidth, setIndicatorWidth] = React.useState(50)

    const updateIndicator = React.useCallback(() => {
      const activeEl = activePage === 'home' ? homeRef.current : toolRef.current
      const stripe = stripeRef.current
      if (!activeEl || !stripe) return
      const elRect = activeEl.getBoundingClientRect()
      const stripeRect = stripe.getBoundingClientRect()
      setIndicatorWidth(elRect.width)
      setIndicatorLeft(elRect.left - stripeRect.left)
    }, [activePage])

    React.useLayoutEffect(() => {
      updateIndicator()
    }, [updateIndicator])

    // Re-measure on window resize
    React.useEffect(() => {
      window.addEventListener('resize', updateIndicator)
      return () => window.removeEventListener('resize', updateIndicator)
    }, [updateIndicator])

    return (
      <nav
        ref={ref as React.Ref<HTMLElement>}
        className={cn('navbar', className)}
        style={navStyle}
        aria-label="Main navigation"
        {...rest}
      >
        {/* ── Top stripe (7px navy) with active-tab indicator ── */}
        <div ref={stripeRef} style={stripeStyle}>
          {indicatorLeft != null && (
            <div
              aria-hidden="true"
              style={{
                ...indicatorStyle,
                left: indicatorLeft,
                width: indicatorWidth,
              }}
            />
          )}
        </div>

        {/* ── Blue bar with nav links ── */}
        <div style={barStyle}>
          <button
            ref={homeRef}
            type="button"
            aria-current={activePage === 'home' ? 'page' : undefined}
            onClick={() => onNavigate?.('home')}
            style={linkStyle}
          >
            Home
          </button>
          <button
            ref={toolRef}
            type="button"
            aria-current={activePage === 'tool' ? 'page' : undefined}
            onClick={() => onNavigate?.('tool')}
            style={linkStyle}
          >
            Lattice Maker Tool
          </button>
        </div>
      </nav>
    )
  }
)

Navbar.displayName = 'Navbar'

/* ─── Styles — all values reference design tokens ─── */

const navStyle: React.CSSProperties = {
  width: '100%',
  flexShrink: 0,
}

const stripeStyle: React.CSSProperties = {
  position: 'relative',
  height: 7,
  backgroundColor: 'var(--navy-primary)',
  overflow: 'hidden',
}

const indicatorStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  backgroundColor: 'var(--gray-50)',
  transition: 'left 180ms ease, width 180ms ease',
}

const barStyle: React.CSSProperties = {
  height: 44,
  backgroundColor: 'var(--blue-bright)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-lg)',
  paddingLeft: 34,
}

const linkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-size-body)',
  fontWeight: 600,
  color: 'var(--text-on-brand)',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

export { Navbar }
