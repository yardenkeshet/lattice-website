import type { Meta, StoryObj } from '@storybook/react'
import { Carousel } from './Carousel'

import img1 from '../../assets/Carousel/home-slider-1 (1).jpg'
import img2 from '../../assets/Carousel/home-slider-2 (1).jpg'
import img3 from '../../assets/Carousel/home-slider-3 (1).jpg'

const IMAGES = [
  { src: img1, alt: 'Lattice structure slide 1' },
  { src: img2, alt: 'Lattice structure slide 2' },
  { src: img3, alt: 'Lattice structure slide 3' },
]

const meta: Meta<typeof Carousel> = {
  title: 'UI/Carousel',
  component: Carousel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A full-width image carousel matching the Figma spec. ' +
          'Pass an array of image objects via `images`. ' +
          'Supports arrows, dot indicators, looping, auto-play, and keyboard navigation (← →).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    height:     { control: 'text', description: 'Height as px number or CSS string' },
    showArrows: { control: 'boolean' },
    showDots:   { control: 'boolean' },
    loop:       { control: 'boolean' },
    autoPlay:   { control: { type: 'number' }, description: 'Auto-advance interval in ms (0 = off)' },
    disabled:   { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Carousel>

/* ── Core ── */

export const Default: Story = {
  args: { images: IMAGES, height: 408 },
}

export const NoLoop: Story = {
  name: 'No Loop (stops at ends)',
  args: { images: IMAGES, height: 408, loop: false },
}

export const AutoPlay: Story = {
  name: 'Auto Play (2s)',
  args: { images: IMAGES, height: 408, autoPlay: 2000 },
}

export const NoArrows: Story = {
  name: 'No Arrows',
  args: { images: IMAGES, height: 408, showArrows: false },
}

export const NoDots: Story = {
  name: 'No Dots',
  args: { images: IMAGES, height: 408, showDots: false },
}

export const Disabled: Story = {
  args: { images: IMAGES, height: 408, disabled: true },
}

/* ── Height variants ── */

export const ShortHeight: Story = {
  name: 'Short (240px)',
  args: { images: IMAGES, height: 240 },
}

export const TallHeight: Story = {
  name: 'Tall (560px)',
  args: { images: IMAGES, height: 560 },
}

/* ── Single image (no controls) ── */

export const SingleImage: Story = {
  name: 'Single Image',
  args: { images: [IMAGES[0]], height: 408 },
}

/* ── All variants ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' }}>
      <Section label="Default (408px, loop, arrows, dots)">
        <Carousel images={IMAGES} height={408} />
      </Section>
      <Section label="Short (240px, no dots)">
        <Carousel images={IMAGES} height={240} showDots={false} />
      </Section>
      <Section label="No loop — arrows disable at ends">
        <Carousel images={IMAGES} height={280} loop={false} />
      </Section>
      <Section label="Disabled">
        <Carousel images={IMAGES} height={240} disabled />
      </Section>
    </div>
  ),
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-size-sm)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        paddingLeft: 4,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
