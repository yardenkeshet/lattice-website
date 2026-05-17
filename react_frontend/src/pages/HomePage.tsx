import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Navbar } from '../components/ui/Navbar'
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

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div style={pageStyle}>
      <Banner />
      <Navbar activePage="home" onNavigate={page => navigate(page === 'tool' ? '/tool' : '/')} />

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

      <Footer />
    </div>
  )
}
