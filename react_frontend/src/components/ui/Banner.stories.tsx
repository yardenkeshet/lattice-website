import type { Meta, StoryObj } from '@storybook/react'
import { Banner } from './Banner'

const meta: Meta<typeof Banner> = {
  title: 'UI/Banner',
  component: Banner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Site-wide header banner with a navy gradient background, a circular lab logo on the left, ' +
          'the Lattice World wordmark in the centre, and the Technion logo on the right. ' +
          'All three logo zones accept custom images via props.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    height: { control: 'text', description: 'Override height (px number or CSS string)' },
  },
}

export default meta
type Story = StoryObj<typeof Banner>

/* ── Default (all Lattice World assets) ── */

export const Default: Story = {}

/* ── Height variants ── */

export const Compact: Story = {
  name: 'Compact (100px)',
  args: { height: 100 },
}

export const Tall: Story = {
  name: 'Tall (220px)',
  args: { height: 220 },
}

/* ── Custom logos ── */

export const CustomRightLogo: Story = {
  name: 'Custom Right Logo',
  args: {
    rightLogo: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/40px-Camponotus_flavomarginatus_ant.jpg',
      alt: 'Custom institution logo',
    },
  },
  parameters: {
    docs: {
      description: { story: 'Replace the right logo with any institution image.' },
    },
  },
}

/* ── All variants ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <Section label="Default (157px)">
        <Banner />
      </Section>
      <Section label="Compact (100px)">
        <Banner height={100} />
      </Section>
      <Section label="Tall (220px)">
        <Banner height={220} />
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
        padding: '0 var(--space-md)',
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
