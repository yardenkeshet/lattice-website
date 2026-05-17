import * as React from 'react'
import { cn } from '../../lib/utils'

export interface FooterProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Optional background image URL for the decorative footer area.
   * Should be a tall image (≥700px) — it is cropped to show a region
   * matching the Figma design.
   * Defaults to a CSS gradient approximating the brand blue pattern.
   */
  bgImage?: string
}

const Footer = React.forwardRef<HTMLElement, FooterProps>(
  ({ bgImage, className, ...rest }, ref) => (
    <footer
      ref={ref as React.Ref<HTMLElement>}
      className={cn('footer', className)}
      style={wrapperStyle}
      {...rest}
    >
      {/* 7px navy top stripe */}
      <div style={stripeStyle} aria-hidden="true" />

      {/* Decorative body area */}
      <div style={bodyStyle}>
        {bgImage ? (
          /* When a real asset is provided, position it the Figma way:
             tall image cropped to show its lower-mid section. */
          <img
            src={bgImage}
            alt=""
            aria-hidden="true"
            style={bgImgStyle}
          />
        ) : (
          /* CSS-only fallback: brand blue radial gradient */
          <div style={bgGradientStyle} aria-hidden="true" />
        )}
      </div>
    </footer>
  )
)

Footer.displayName = 'Footer'

/* ─── Styles — all values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  width: '100%',
  flexShrink: 0,
}

const stripeStyle: React.CSSProperties = {
  height: 7,
  backgroundColor: 'var(--navy-primary)',
  width: '100%',
}

const bodyStyle: React.CSSProperties = {
  position: 'relative',
  height: 88,
  overflow: 'hidden',
  backgroundColor: 'var(--navy-dark)',
}

/* When a real background image is supplied — mirrors the Figma overflow crop */
const bgImgStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-0.05%',
  top: '-520%',   /* crops to ~lower-mid region of a ~700px tall image */
  width: '104.58%',
  height: '830%',
  objectFit: 'cover',
  pointerEvents: 'none',
}

/* CSS fallback — two overlapping radial gradients suggesting the wave/circle brand motif */
const bgGradientStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: [
    'radial-gradient(ellipse 60% 200% at -10% 120%, var(--blue-bright) 0%, transparent 70%)',
    'radial-gradient(ellipse 40% 160% at 110% 80%, var(--blue-light) 0%, transparent 60%)',
  ].join(', '),
}

export { Footer }
