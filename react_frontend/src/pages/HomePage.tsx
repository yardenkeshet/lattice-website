import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Carousel } from '../components/ui/Carousel'
import { Footer } from '../components/ui/Footer'

const imageModules = import.meta.glob('../assets/Carousel/*.{jpg,JPG,png,PNG}', { eager: true })
const SLIDES = Object.entries(imageModules).map(([path, mod]) => ({
  src: (mod as { default: string }).default,
  alt: path.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? '',
}))

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

const bodyLinkStyle: React.CSSProperties = {
  color: 'var(--action-primary)',
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


const hyperlinkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  color: 'rgba(255,255,255,0.7)',
  margin: 0,
  textDecoration: 'underline'
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

      {/* ── Carousel ── */}
      <Carousel images={SLIDES} loop autoPlay={5000} showDots={false} />

      {/* ── CTA ── */}
      <div style={ctaSectionStyle}>
        <p style={ctaTitleStyle}>Ready to build a lattice structure?</p>
        <p style={ctaSubtitleStyle}>
          Upload your surface file and generate a parametric lattice in seconds.
        </p>
        <p style={ctaSubtitleStyle}>
          Go to the <a href="/help/full" style={hyperlinkStyle} >help page</a> or hover over an item to see helpful tips.
        </p>
        <button
          type="button"
          style={ctaButtonStyle}
          onClick={() => navigate('/tool')}
        >
          Open Lattice Maker →
        </button>
      </div>

      {/* ── Body text ── */}
      <div style={bodyTextStyle}>
        <p style={paragraphStyle}>
          This Web interface is based on patented volumetric representation (V-rep) abilities of
          the IRIT solid modeling kernel (see{' '}
          <a href="https://gershon.cs.technion.ac.il/irit" target="_blank" rel="noopener noreferrer" style={bodyLinkStyle}>
            https://gershon.cs.technion.ac.il/irit
          </a>). For more, see the <a href="/help/full" style={bodyLinkStyle}>full guide</a>.
        </p>
        <p style={paragraphStyle}>
          Use of lattices created using this interface is free of charge, including for
          commercial purposes. Please acknowledge as follows: "Created using{' '}
          <em>LatticeMaker</em>,{' '}
          <a href="https://lattice.cs.technion.ac.il" target="_blank" rel="noopener noreferrer" style={bodyLinkStyle}>
            https://lattice.cs.technion.ac.il
          </a>, Gershon Elber, Technion".
        </p>
      </div>

      <Footer />
    </div>
  )
}
