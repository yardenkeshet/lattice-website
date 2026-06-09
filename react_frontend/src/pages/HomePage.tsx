import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Carousel } from '../components/ui/Carousel'
import { Footer } from '../components/ui/Footer'

import slide1 from '../assets/Carousel/home-slider-1 (1).jpg'
import slide2 from '../assets/Carousel/home-slider-2 (1).jpg'
import slide3 from '../assets/Carousel/home-slider-3 (1).jpg'

const SLIDES = [
  { src: slide1, alt: 'Lattice structure example 1' },
  { src: slide2, alt: 'Lattice structure example 2' },
  { src: slide3, alt: 'Lattice structure example 3' },
]

const TAMC_TEXT = `The Technion Additive Manufacturing and 3D printing Center (TAMC), inaugurated in 2021, reflects the Technion's commitment to promoting cutting-edge additive manufacturing (AM) innovation. The center was founded with the generous support of Mr. Robert Davis and is committed to fulfilling an academic leadership role in promoting futuristic advancements in AM technology, as well as supporting Israeli industry.

TAM will develop a comprehensive repository of AM data and technologies while encouraging, advising, and supporting synergic AM research efforts.`

/* ─── Styles ─── */

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-primary)',
}

const bodyTextStyle: React.CSSProperties = {
  padding: '24px 43px',
  maxWidth: 1200,
}

const paragraphStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
  margin: '0 0 var(--space-sm)',
}

const separatorStyle: React.CSSProperties = {
  height: 7,
  backgroundColor: 'var(--navy-primary)',
  width: '100%',
  flexShrink: 0,
}

/* ── CTA section ── */

const ctaSectionStyle: React.CSSProperties = {
  backgroundColor: 'var(--navy-primary)',
  padding: '40px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  textAlign: 'center',
}

const ctaTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text-on-brand)',
  margin: 0,
}

const ctaSubtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
  margin: 0,
}

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--gray-50)',
  color: 'var(--navy-primary)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  padding: '16px 48px',
  fontFamily: 'var(--font-body)',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 8,
}

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div style={pageStyle}>
      <Banner />

      {/* ── Body text ── */}
      <div style={bodyTextStyle}>
        {TAMC_TEXT.split('\n\n').map((para, i) => (
          <p key={i} style={paragraphStyle}>{para}</p>
        ))}
      </div>

      {/* Navy separator */}
      <div style={separatorStyle} aria-hidden="true" />

      {/* ── Carousel ── */}
      <Carousel images={SLIDES} loop autoPlay={5000} />

      {/* ── CTA ── */}
      <div style={ctaSectionStyle}>
        <p style={ctaTitleStyle}>Ready to build a lattice structure?</p>
        <p style={ctaSubtitleStyle}>
          Upload your surface file and generate a parametric lattice in seconds.
        </p>
        <button
          type="button"
          style={ctaButtonStyle}
          onClick={() => navigate('/tool')}
        >
          Open Lattice Maker →
        </button>
      </div>

      <Footer />
    </div>
  )
}
