import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

import defaultKonsis   from '../../assets/Banner/konsis 10.jpg'
import defaultLabLogo  from '../../assets/CSLogo400.png'
import defaultCenter   from '../../assets/Banner/Lattice.png'
import defaultRightLogo from '../../assets/Banner/technion-logo (1).png'

export interface BannerProps {
  /**
   * Background image for the circular blob on the left section.
   * Defaults to the Lattice World konsis image.
   */
  leftBg?: string
  /**
   * Logo displayed over the left circle (lab logo).
   * Defaults to the TAMC logo.
   */
  leftLogo?: { src: string; alt: string }
  /**
   * Centre logo / wordmark.
   * Defaults to the Lattice World logo.
   */
  centerLogo?: { src: string; alt: string }
  /**
   * Logo pinned to the right edge.
   * Defaults to the Technion logo.
   */
  rightLogo?: { src: string; alt: string }
  /**
   * When provided, the TAMC logo (left section) becomes a button that fires this callback.
   * Intended use: navigate to home page. Omit on the home page itself.
   */
  onClick?: () => void
  /** Override banner height. Defaults to var(--banner-height) = 157px. */
  height?: number | string
  /** Render the outer element as its child (Slot / asChild pattern) */
  asChild?: boolean
  className?: string
  'aria-label'?: string
}

// Note: ref is forwarded to the outer wrapper element.
const Banner = React.forwardRef<HTMLElement, BannerProps>(
  (
    {
      leftBg      = defaultKonsis,
      leftLogo    = { src: defaultLabLogo,   alt: 'Technion center for Additive Manufacturing and 3D Printing' },
      centerLogo  = { src: defaultCenter,    alt: 'Lattice World' },
      rightLogo   = { src: defaultRightLogo, alt: 'Technion — Israel Institute of Technology' },
      onClick,
      height,
      asChild = false,
      className,
      'aria-label': ariaLabel = 'Site banner',
    },
    ref
  ) => {
    const resolvedHeight = height != null
      ? typeof height === 'number' ? `${height}px` : height
      : 'var(--banner-height)'

    const [isLogoFocused, setIsLogoFocused] = React.useState(false)

    const Wrapper = asChild ? Slot : 'header'

    return (
      <Wrapper
       onClick={onClick}
        ref={ref as React.Ref<HTMLElement>}
        className={cn('banner', className)}
        style={{ ...wrapperStyle, height: resolvedHeight }}
        aria-label={ariaLabel}
        role="banner"
      >
        {/* ── Left section: circular background + lab logo ── */}
        <div style={leftSectionStyle}>
          {/* Circle blob — overflows top/left intentionally (Figma: x=-182, y=-82) */}
          <div style={circleBlobStyle}>
            <img
              src={leftBg}
              alt=""
              aria-hidden="true"
              style={circleBlobImgStyle}
            />
          </div>
          {/* Lab logo — button if onLeftLogoClick provided, plain img otherwise */}
          {
            <button
              type="button"
              onClick={onClick}
              onFocus={() => setIsLogoFocused(true)}
              onBlur={() => setIsLogoFocused(false)}
              title="Go to home"
              aria-label="Go to home page"
              style={{
                ...labLogoButtonStyle,
                outline: isLogoFocused ? '2px solid var(--border-focus)' : 'none',
                outlineOffset: 2,
              }}
            >
              <img
                src={leftLogo.src}
                alt=""
                aria-hidden="true"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </button>
          }
        </div>

        {/* ── Centre: main wordmark ── */}
        <div style={centerSectionStyle}>
          <img
            src={centerLogo.src}
            alt={centerLogo.alt}
            style={centerLogoStyle}
          />
        </div>

        {/* ── Right: institution logo ── */}
        <div style={rightSectionStyle}>
          <img
            src={rightLogo.src}
            alt={rightLogo.alt}
            style={rightLogoStyle}
          />
        </div>
      </Wrapper>
    )
  }
)

Banner.displayName = 'Banner'

/* ─── Styles — structural values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  background: 'var(--banner-bg)',
  overflow: 'hidden',
  flexShrink: 0,
}

/* Left 360px section — clips the overflow circle */
const leftSectionStyle: React.CSSProperties = {
  position: 'relative',
  width: 'var(--banner-left-w)',
  height: '100%',
  overflow: 'hidden',
  flexShrink: 0,
}

/* Circular blob: 496px circle positioned so it peeks out top-left (Figma coords: x=-182, y=-82) */
const circleBlobStyle: React.CSSProperties = {
  position: 'absolute',
  width: 'var(--banner-circle-size)',
  height: 'var(--banner-circle-size)',
  borderRadius: 'var(--radius-full)',
  top: '-82px',
  left: '-273px',
  overflow: 'hidden',
}

const circleBlobImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}

const labLogoStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-25px',
  top: '5px',
  width: '239px',
  height: '148px',
  objectFit: 'contain',
}

/* TAMC logo button (when onLeftLogoClick is provided) */
const labLogoButtonStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-25px',
  top: '5px',
  width: '239px',
  height: '148px',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'block',
}

/* Centre section fills the remaining space */
const centerSectionStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
}

const centerLogoStyle: React.CSSProperties = {
  height: '80%',
  maxHeight: '126px',
  objectFit: 'contain',
}

/* Right section — Figma: w=232, h=53 for the logo */
const rightSectionStyle: React.CSSProperties = {
  width: 'var(--banner-right-w)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingRight: 'var(--space-lg)',
  flexShrink: 0,
}

const rightLogoStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '232px',
  height: '53px',
  objectFit: 'contain',
}

export { Banner }
