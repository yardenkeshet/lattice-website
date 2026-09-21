import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Footer } from '../components/ui/Footer'

interface HelpStep {
  title: string
  body: string
}

const STEPS: HelpStep[] = [
  {
    title: '1. Choose a macro-shape construction mode',
    body: 'In the Lattice Maker panel (left), pick how your surface should become a 3D volume: Extrusion pushes a single surface along its normal by a chosen length; Revolution spins a single surface around the +Z axis; Ruling blends two surfaces together into the volume between them. Each IGES file must contain a single tensor-product Bezier or B-spline surface with no interior knots — U/V degrees can be anything.',
  },
  {
    title: '2. Upload your surface file(s)',
    body: 'Click "Load surface as IGES file" (or drag a .igs file onto the 3D viewer) to add your surface. Extrusion and Revolution need one file; Ruling needs two. Uploaded surfaces are tessellated for preview only — open "Viewer Settings" to adjust the Tessellation Tolerance if the preview looks too coarse or too slow; the actual lattice is always computed from the raw IGES data.',
  },
  {
    title: '3. Set the lattice parameters',
    body: 'Tiles Counts (X / Y / Z, 1–10 each) control how many lattice tiles are placed across the surface\'s parametric domain and through its thickness. Grading Start / Grading End linearly vary the thickness of the tile arms from one end of the Z direction to the other, so you can taper a lattice from thick to thin.',
  },
  {
    title: '4. Pick a tile type and shape it',
    body: 'The Tile panel (right) lets you choose between Cross, Diagonal, and Cross Diagonal unit cells. Drag a slider to preview the change live.',
  },
  {
    title: '5. Calculate',
    body: 'Once your surface(s) and parameters are set, press "Make Lattice" in the toolbar above the viewer.',
  },
  {
    title: '6. Explore the result',
    body: 'Orbit, pan, and scroll to zoom in the 3D viewer. Toggle between Perspective and Orthographic camera modes from the toolbar. Open "Viewer Settings" in the Lattice Maker panel to change the foreground (model) and background colors.',
  },
  {
    title: '7. Export',
    body: 'Once a calculation completes, "Export Lattice" becomes available in the toolbar. Choose to download the result as an STL (mesh) or IGS (surface) file.',
  },
]

/* ─── Styles ─── */

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-primary)',
}

const bodyTextStyle: React.CSSProperties = {
  padding: '24px 43px',
  maxWidth: 900,
}

const introStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
  margin: '0 0 var(--space-md)',
}

const stepsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const stepTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--navy-primary)',
  margin: '0 0 6px',
}

const stepBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
  margin: 0,
}

export function HelpPage() {
  const navigate = useNavigate()

  return (
    <div style={pageStyle}>
      <Banner onClick={() => navigate('/')} />

      {/* ── Body text ── */}
      <div style={bodyTextStyle}>
        <p style={introStyle}>
          This page walks you through using the Lattice Maker tool, from uploading a surface
          to exporting a finished lattice structure.
        </p>

        <div style={stepsListStyle}>
          {STEPS.map(step => (
            <div key={step.title}>
              <p style={stepTitleStyle}>{step.title}</p>
              <p style={stepBodyStyle}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  )
}
