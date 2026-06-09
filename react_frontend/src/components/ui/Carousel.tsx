import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/utils'

export interface CarouselImage {
  src: string
  alt?: string
}

export interface CarouselProps {
  /** Array of images to display */
  images: CarouselImage[]
  /** Height of the carousel. Defaults to 408px (Figma spec). */
  height?: number | string
  /** Show previous/next arrow buttons */
  showArrows?: boolean
  /** Show dot indicators at the bottom */
  showDots?: boolean
  /** Loop back to start after the last slide */
  loop?: boolean
  /** Auto-advance slides (ms between transitions). 0 = disabled. */
  autoPlay?: number
  /** Disable all interaction */
  disabled?: boolean
  /** Render the outer wrapper as its child (Slot / asChild pattern) */
  asChild?: boolean
  className?: string
  'aria-label'?: string
}

const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  (
    {
      images,
      height = 408,
      showArrows = true,
      showDots = true,
      loop = true,
      autoPlay = 0,
      disabled = false,
      asChild = false,
      className,
      'aria-label': ariaLabel = 'Image carousel',
    },
    ref
  ) => {
    const [current, setCurrent] = React.useState(0)
    const [hoveredArrow, setHoveredArrow] = React.useState<'left' | 'right' | null>(null)
    const count = images.length

    const prev = () => {
      if (disabled) return
      setCurrent(i => (i === 0 ? (loop ? count - 1 : 0) : i - 1))
    }
    const next = () => {
      if (disabled) return
      setCurrent(i => (i === count - 1 ? (loop ? 0 : count - 1) : i + 1))
    }
    const goTo = (i: number) => { if (!disabled) setCurrent(i) }

    // Auto-play
    React.useEffect(() => {
      if (!autoPlay || disabled) return
      const id = setInterval(next, autoPlay)
      return () => clearInterval(id)
    }, [autoPlay, disabled, count, loop])

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }

    const resolvedHeight = typeof height === 'number' ? `${height}px` : height

    const Wrapper = asChild ? Slot : 'div'

    const atStart = current === 0
    const atEnd   = current === count - 1

    return (
      <Wrapper
        ref={ref}
        className={cn('carousel', className)}
        style={{
          ...wrapperStyle,
          height: resolvedHeight,
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
        aria-label={ariaLabel}
        aria-roledescription="carousel"
        role="region"
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? undefined : 0}
      >
        {/* ── Image track ── */}
        <div
          style={{
            ...trackStyle,
            transform: `translateX(-${current * 100}%)`,
          }}
          aria-live="polite"
        >
          {images.map((img, i) => (
            <div
              key={img.src}
              style={slideContainerStyle}
              aria-hidden={i !== current}
            >
              <img
                src={img.src}
                alt={img.alt ?? `Slide ${i + 1}`}
                style={slideImgStyle}
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* ── Edge gradient overlay ── */}
        <div style={overlayStyle} aria-hidden="true" />

        {/* ── Arrow buttons ── */}
        {showArrows && count > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              disabled={!loop && atStart}
              aria-label="Previous slide"
              style={{
                ...arrowStyle,
                left: 0,
                ...(hoveredArrow === 'left' ? arrowHoverStyle : {}),
                ...(!loop && atStart ? arrowDisabledStyle : {}),
              }}
              onMouseEnter={() => setHoveredArrow('left')}
              onMouseLeave={() => setHoveredArrow(null)}
            >
              <ChevronLeft />
            </button>

            <button
              type="button"
              onClick={next}
              disabled={!loop && atEnd}
              aria-label="Next slide"
              style={{
                ...arrowStyle,
                right: 0,
                ...(hoveredArrow === 'right' ? arrowHoverStyle : {}),
                ...(!loop && atEnd ? arrowDisabledStyle : {}),
              }}
              onMouseEnter={() => setHoveredArrow('right')}
              onMouseLeave={() => setHoveredArrow(null)}
            >
              <ChevronRight />
            </button>
          </>
        )}

        {/* ── Dot indicators ── */}
        {showDots && count > 1 && (
          <div style={dotsStyle} aria-label="Slide indicators">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === current}
                style={{
                  ...dotStyle,
                  ...(i === current ? dotActiveStyle : {}),
                }}
              />
            ))}
          </div>
        )}
      </Wrapper>
    )
  }
)

Carousel.displayName = 'Carousel'

/* ─── Arrow icons ─── */

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13 4L7 10L13 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 4L13 10L7 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Styles — all values reference design tokens ─── */

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  outline: 'none',
  userSelect: 'none',
}

const trackStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  transition: 'transform 400ms cubic-bezier(0.4, 0, 0.2, 1)',
}

const slideContainerStyle: React.CSSProperties = {
  flex: '0 0 100%',
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const slideImgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  width: 'auto',
  height: 'auto',
  display: 'block',
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--carousel-overlay)',
  pointerEvents: 'none',
  zIndex: 5,
}

const arrowStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 'var(--carousel-arrow-w)',
  height: 'var(--carousel-arrow-h)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--carousel-arrow-bg)',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  outline: 'none',
  transition: 'background-color 150ms ease, opacity 150ms ease',
  zIndex: 20,
}

const arrowHoverStyle: React.CSSProperties = {
  backgroundColor: 'var(--carousel-arrow-bg-hover)',
}

const arrowDisabledStyle: React.CSSProperties = {
  opacity: 0.3,
  cursor: 'not-allowed',
  pointerEvents: 'none',
}

const dotsStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'var(--space-sm)',
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 'var(--space-sm)',
  zIndex: 10,
}

const dotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: 'var(--radius-full)',
  backgroundColor: 'var(--carousel-arrow-bg)',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  transition: 'background-color 200ms ease, transform 200ms ease',
}

const dotActiveStyle: React.CSSProperties = {
  backgroundColor: 'var(--white)',
  transform: 'scale(1.25)',
}

export { Carousel }
