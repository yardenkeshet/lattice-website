import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { TileCard } from './TileCard'

const meta: Meta<typeof TileCard> = {
  title: 'UI/TileCard',
  component: TileCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A 3D tile preview card powered by React Three Fiber. ' +
          'Pass a URL to any STL file via `modelUrl`. ' +
          'Small (80px) shows a label; large (166px) is the full real-time display. ' +
          'Supports default, hover, selected, and disabled states.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size:         { control: 'radio', options: ['small', 'large'] },
    selected:     { control: 'boolean' },
    disabled:     { control: 'boolean' },
    enableOrbit:  { control: 'boolean' },
    meshColor:    { control: 'color' },
    label:        { control: 'text' },
    modelUrl:     { control: 'text', description: 'URL to an STL file' },
  },
}

export default meta
type Story = StoryObj<typeof TileCard>

/* ── Single card states ── */

export const Default: Story = {
  args: {
    label: 'Cross',
    size: 'small',
  },
}

export const Selected: Story = {
  args: {
    label: 'Cross',
    size: 'small',
    selected: true,
  },
}

export const Disabled: Story = {
  args: {
    label: 'Cross',
    size: 'small',
    disabled: true,
  },
}

export const LargePreview: Story = {
  name: 'Large (Real-time Display)',
  args: {
    size: 'large',
    enableOrbit: true,
  },
}

export const WithOrbit: Story = {
  name: 'With Orbit Controls',
  args: {
    label: 'Diagonal',
    size: 'small',
    enableOrbit: true,
  },
}

/* ── STL file (provide a real URL to test) ── */

export const WithSTLFile: Story = {
  name: 'With STL File',
  args: {
    label: 'From STL',
    size: 'small',
    // Replace with a real STL URL to test loading:
    modelUrl: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Set `modelUrl` to a real `.stl` URL (e.g. from `/last_results/`) to see the model load.',
      },
    },
  },
}

/* ── Tile selector group (interactive) ── */

export const TileSelector: Story = {
  name: 'Tile Selector (click to select)',
  render: () => {
    const tiles = [
      { value: 'cross',          label: 'Cross' },
      { value: 'diagonal',       label: 'Diagonal' },
      { value: 'cross_diagonal', label: 'Cross Diagonal' },
    ]
    const [selected, setSelected] = useState('cross')

    return (
      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
        {tiles.map(t => (
          <TileCard
            key={t.value}
            label={t.label}
            size="small"
            selected={selected === t.value}
            onClick={() => setSelected(t.value)}
            aria-label={t.label}
          />
        ))}
      </div>
    )
  },
}

/* ── All variants ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' }}>

      <Section label="Small — states">
        <TileCard label="Default"  size="small" />
        <TileCard label="Selected" size="small" selected />
        <TileCard label="Disabled" size="small" disabled />
        <TileCard label="Orbit"    size="small" enableOrbit />
      </Section>

      <Section label="Small — mesh colours">
        <TileCard label="Default"  size="small" meshColor="#c8c8c8" />
        <TileCard label="Navy"     size="small" meshColor="var(--navy-primary)" />
        <TileCard label="Accent"   size="small" meshColor="var(--blue-light)" />
      </Section>

      <Section label="Large — real-time display">
        <TileCard size="large" />
        <TileCard size="large" selected />
        <TileCard size="large" enableOrbit />
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
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {children}
      </div>
    </div>
  )
}
