import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

import defaultKonsis   from '../../assets/Banner/konsis 10.jpg'
import defaultLabLogo  from '../../assets/Banner/logo-tamc (1).png'
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

    const Wrapper = asChild ? Slot : 'header'

    return (
      <Wrapper
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
          {/* Lab logo overlaid on the circle */}
          <img
            src={leftLogo.src}
            alt={leftLogo.alt}
            style={labLogoStyle}
          />
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
  left: '-182px',
  overflow: 'hidden',
}

const circleBlobImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
}

/* TAMC logo — Figma: x=25, y=20, w=191, h=118 */
const labLogoStyle: React.CSSProperties = {
  position: 'absolute',
  left: '25px',
  top: '20px',
  width: '191px',
  height: '118px',
  objectFit: 'contain',
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
