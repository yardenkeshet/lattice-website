import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../components/ui/Banner'
import { Footer } from '../components/ui/Footer'
import annotatedScreenshot from '../assets/help/lattice-maker-annotated.png'

interface HelpStep {
  title: string
  body: React.ReactNode
}

/* ─── Styles (shared visual language with HelpPage) ───
   Declared before STEPS/COMMENTS below, which reference some of these
   inline in JSX evaluated eagerly at module load — not just at render. */

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

const pageTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--navy-primary)',
  margin: '0 0 var(--space-md)',
}

const introStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
  margin: '0 0 var(--space-md)',
}

const contentRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 32,
  flexWrap: 'wrap',
  alignItems: 'flex-start',
}

const textColStyle: React.CSSProperties = {
  flex: '1 1 480px',
  minWidth: 280,
}

const imageColStyle: React.CSSProperties = {
  flex: '0 1 440px',
  minWidth: 280,
}

const annotatedImageStyle: React.CSSProperties = {
  width: '100%',
  height: 'auto',
  borderRadius: 'var(--radius-card)',
  boxShadow: '0px 2px 8px rgba(0,0,0,0.15)',
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

const stepListStyle: React.CSSProperties = {
  margin: '8px 0',
  paddingLeft: 20,
}

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--navy-primary)',
  margin: '32px 0 10px',
}

const commentsListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
}

const restrictionsListStyle: React.CSSProperties = {
  ...commentsListStyle,
  margin: '8px 0 0',
}

const linkStyle: React.CSSProperties = {
  color: 'var(--action-primary)',
}

const closingParaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: 13,
  lineHeight: '19px',
  color: 'var(--text-base)',
  margin: '14px 0 0',
}

/* ─── Content ─── */

const STEPS: HelpStep[] = [
  {
    title: '1. Select a tile',
    body: (
      <>
        In <em>LatticeMaker</em>, we offer three types of tiles — a cross-arms tile, a diagonal-arms
        tile, and a cross+diagonal-arms tile (see 1a on the right). In all three cases, you can
        control parameters of the tile, like the arms' thicknesses (see 1b on the right).
      </>
    ),
  },
  {
    title: '2. Set the tile counts',
    body: <>Set the number of tiles in the macro shape's containing volume (see 2a on the right).</>,
  },
  {
    title: '3. Construct a macro shape',
    body: (
      <>
        Construct a macro shape which will contain the lattice as a B-spline trivariate 3D volume,
        by providing one or two IGES surfaces, with which the macro shape is created. The macro
        shape can be created as (see 3a):
        <ul style={stepListStyle}>
          <li>a. An extrusion of one IGES surface into a volume. Extrusion is always along the +Z axis, in an amount that can be set.</li>
          <li>b. A revolution of an IGES surface into a volume. Revolution is always around the +Z axis, 360 degrees.</li>
          <li>c. A ruling between two IGES surfaces into a volume.</li>
        </ul>
        IGES surfaces can be dragged and dropped into the main window, one at a time. Alternatively,
        click the "Load Geometry as IGES's files" button (see 3b), where two surfaces can be
        selected simultaneously.
      </>
    ),
  },
  {
    title: '4. Make Lattice',
    body: <>Press "Make Lattice" (see 4). A progress bar indicates the progress of the calculation, then displays the final lattice.</>,
  },
  {
    title: '5. Export',
    body: <>If you like, press "Export Lattice" (see 5) to export the lattice as an IGES (surfaces) or STL file, to your local machine.</>,
  },
]

const COMMENTS: React.ReactNode[] = [
  <>The toolbar has a toggle button to switch between Perspective and Orthographic views.</>,
  <>The Lattice Maker panel has a "Viewer Settings" option, with which you can control the foreground/background colors, tessellation tolerance for display, and more.</>,
  <>
    This Web interface also demonstrates the ability to create graded geometry — tiles that change
    shape along the lattice. Here, you can vary arm thickness from beginning to end, along the
    third parametric axis of the trivariate (not to be confused with the Z axis of 3-space) (see 3c).
  </>,
]

export function HelpFullPage() {
  const navigate = useNavigate()

  return (
    <div style={pageStyle}>
      <Banner onClick={() => navigate('/')} />

      <div style={bodyTextStyle}>
        <p style={pageTitleStyle}>Lattice Maker — Help</p>

        <p style={introStyle}>
          <em>LatticeMaker</em> can create freeform conformal lattices, which are graded along one
          parametric axis, with input and output as B-rep B-spline geometry imported and exported
          as surface geometry in the IGES file format.
        </p>

        <div style={contentRowStyle}>
          <div style={textColStyle}>
            <p style={introStyle}>The process of creating a lattice consists of:</p>

            <div style={stepsListStyle}>
              {STEPS.map(step => (
                <div key={step.title}>
                  <p style={stepTitleStyle}>{step.title}</p>
                  <p style={stepBodyStyle}>{step.body}</p>
                </div>
              ))}
            </div>

            <p style={sectionTitleStyle}>Comments</p>
            <ol style={commentsListStyle}>
              {COMMENTS.map((comment, i) => <li key={i}>{comment}</li>)}
            </ol>

            <p style={sectionTitleStyle}>Restrictions</p>
            <p style={stepBodyStyle}>
              The <em>LatticeMaker</em> is a web-based interface to create 3D lattices, but with
              some restrictions:
            </p>
            <ul style={restrictionsListStyle}>
              <li>
                The input/loaded IGES surface(s), with which the lattice-containing macro-shape
                volume is created, should be provided in the IGES file format, holding a single
                surface each, and the surface should be either a Bezier surface or a B-spline
                surface with no internal knots. See, for example,{' '}
                <a href="/sample-surfaces/DiskSimpleSrf.igs" style={linkStyle} download>DiskSimpleSrf.igs</a>{' '}
                (extrudes into a cylinder volume) and{' '}
                <a href="/sample-surfaces/SimpleRevolve.igs" style={linkStyle} download>SimpleRevolve.igs</a>{' '}
                (revolves around +Z into a square-section torus volume).
              </li>
              <li>Extrusion is only along the +Z axis, in an amount that can be set.</li>
              <li>Revolution is only around the Z axis, full circle (360 degrees).</li>
              <li>The number of tiles in each of the three axes of the containing volume can only be between one and ten.</li>
            </ul>

            <p style={closingParaStyle}>
              If any of these restrictions are overly constraining for you, and/or you have any
              questions regarding this interface, you are welcome to contact us at{' '}
              <a href="mailto:lattice@cs.technion.ac.il" style={linkStyle}>lattice@cs.technion.ac.il</a>{' '}
              to see if/how we can help.
            </p>

            <p style={closingParaStyle}>
              This Web interface is based on the volumetric representation (V-rep) abilities of
              the IRIT solid modeling kernel (see{' '}
              <a href="https://gershon.cs.technion.ac.il/irit" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                https://gershon.cs.technion.ac.il/irit
              </a>), and the technology is patented. For a simple introduction, you can read the
              academic review publication at{' '}
              <a
                href="https://www.sciencedirect.com/science/article/abs/pii/S0010448523001197"
                target="_blank" rel="noopener noreferrer" style={linkStyle}
              >
                sciencedirect.com/science/article/abs/pii/S0010448523001197
              </a>:
            </p>
            <p style={closingParaStyle}>
              Gershon Elber. "A Review of a B-spline based Volumetric Representation: Design,
              Analysis and Fabrication of Porous and/or Heterogeneous Geometries", Computer Aided
              Design, Vol 163, 2023, 103587.
            </p>

            <p style={closingParaStyle}>
              Use of lattices created using this interface, within the permissible restrictions
              presented above, is free of charge, including for commercial purposes. Please
              acknowledge as follows: "Created using <em>LatticeMaker</em>,{' '}
              <a href="https://lattice.cs.technion.ac.il" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                https://lattice.cs.technion.ac.il
              </a>, Gershon Elber, Technion".
            </p>
          </div>

          <div style={imageColStyle}>
            <img
              src={annotatedScreenshot}
              alt="Annotated screenshot of the Lattice Maker tool, numbered to match the steps described"
              style={annotatedImageStyle}
            />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
