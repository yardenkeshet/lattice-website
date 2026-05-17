import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Dropdown } from './Dropdown'

const CALC_MODES = [
  { value: 'extrusion', label: 'Extrusion' },
  { value: 'revolution', label: 'Revolution' },
  { value: 'ruling', label: 'Ruling' },
]

const TILE_TYPES = [
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'cross', label: 'Cross' },
  { value: 'cross_diagonal', label: 'Cross Diagonal' },
]

const MANY_OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Delta' },
  { value: 'e', label: 'Epsilon' },
  { value: 'f', label: 'Zeta' },
  { value: 'g', label: 'Eta' },
]

const meta: Meta<typeof Dropdown> = {
  title: 'UI/Dropdown',
  component: Dropdown,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A compact select dropdown built on Radix UI Select primitives. ' +
          'Matches the Figma design with a 32px trigger, 10px bold label, and animated chevron. ' +
          'Supports open-down and open-to-side variants.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    side:     { control: 'radio', options: ['bottom', 'right'] },
    align:    { control: 'radio', options: ['start', 'center', 'end'] },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    label:    { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof Dropdown>

/* ── Core states ── */

export const Default: Story = {
  args: {
    options: CALC_MODES,
    defaultValue: 'extrusion',
    side: 'bottom',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

export const WithLabel: Story = {
  name: 'With Label',
  args: {
    label: 'Calculation mode',
    options: CALC_MODES,
    defaultValue: 'extrusion',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

export const Placeholder: Story = {
  name: 'No Selection (Placeholder)',
  args: {
    options: CALC_MODES,
    placeholder: 'Select mode…',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

export const Disabled: Story = {
  args: {
    options: CALC_MODES,
    defaultValue: 'extrusion',
    disabled: true,
    label: 'Calculation mode',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

/* ── Direction variants ── */

export const OpenDown: Story = {
  name: 'Open Down (default)',
  args: {
    options: CALC_MODES,
    defaultValue: 'extrusion',
    side: 'bottom',
    label: 'Calculation mode',
  },
  decorators: [Story => <div style={{ width: 168, marginTop: 8 }}><Story /></div>],
}

export const OpenToSide: Story = {
  name: 'Open to Side',
  args: {
    options: TILE_TYPES,
    defaultValue: 'diagonal',
    side: 'right',
    label: 'Tile type',
  },
  decorators: [Story => <div style={{ width: 168, marginTop: 8 }}><Story /></div>],
}

/* ── Width variants ── */

export const FixedWidth: Story = {
  name: 'Fixed Width',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Dropdown label="Full width (default)" options={CALC_MODES} defaultValue="extrusion" />
      <Dropdown label="168px (Figma)" options={CALC_MODES} defaultValue="extrusion" width={168} />
      <Dropdown label="240px" options={CALC_MODES} defaultValue="revolution" width={240} />
    </div>
  ),
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

/* ── Disabled options ── */

export const DisabledOptions: Story = {
  name: 'Disabled Options',
  args: {
    label: 'Method',
    options: [
      { value: 'extrusion', label: 'Extrusion' },
      { value: 'revolution', label: 'Revolution', disabled: true },
      { value: 'ruling', label: 'Ruling', disabled: true },
    ],
    defaultValue: 'extrusion',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

/* ── Controlled ── */

export const Controlled: Story = {
  name: 'Controlled',
  render: () => {
    const [val, setVal] = useState('extrusion')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <Dropdown
          label="Calculation mode"
          options={CALC_MODES}
          value={val}
          onChange={setVal}
          width={168}
        />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-size-body)', color: 'var(--text-secondary)', margin: 0 }}>
          Selected: <strong>{val}</strong>
        </p>
      </div>
    )
  },
}

/* ── Long list ── */

export const ManyOptions: Story = {
  name: 'Many Options (scrollable)',
  args: {
    label: 'Greek letters',
    options: MANY_OPTIONS,
    defaultValue: 'a',
  },
  decorators: [Story => <div style={{ width: 168 }}><Story /></div>],
}

/* ── All variants overview ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)', width: 280 }}>
      <Row label="Default">
        <Dropdown options={CALC_MODES} defaultValue="extrusion" width={168} />
      </Row>
      <Row label="With label">
        <Dropdown label="Calculation mode" options={CALC_MODES} defaultValue="extrusion" width={168} />
      </Row>
      <Row label="Placeholder">
        <Dropdown options={CALC_MODES} placeholder="Select…" width={168} />
      </Row>
      <Row label="Open to side">
        <Dropdown label="Tile type" options={TILE_TYPES} defaultValue="diagonal" side="right" width={168} />
      </Row>
      <Row label="Disabled">
        <Dropdown options={CALC_MODES} defaultValue="extrusion" disabled width={168} />
      </Row>
      <Row label="Disabled options">
        <Dropdown
          options={[
            { value: 'extrusion', label: 'Extrusion' },
            { value: 'revolution', label: 'Revolution', disabled: true },
          ]}
          defaultValue="extrusion"
          width={168}
        />
      </Row>
    </div>
  ),
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-size-sm)',
        color: 'var(--text-secondary)',
        width: 120,
        flexShrink: 0,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}
