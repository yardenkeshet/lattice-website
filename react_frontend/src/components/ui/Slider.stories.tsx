import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './Slider'

const meta: Meta<typeof Slider> = {
  title: 'UI/Slider',
  component: Slider,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A chunky range slider built on Radix UI primitives, styled with Lattice World design tokens. Supports optional value badge, label, min/max, disabled state, and range (two-thumb) mode.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    min:            { control: { type: 'number' } },
    max:            { control: { type: 'number' } },
    step:           { control: { type: 'number' } },
    showValue:      { control: 'boolean' },
    disabled:       { control: 'boolean' },
    label:          { control: 'text' },
    valuePrecision: { control: { type: 'number', min: 0, max: 4 } },
    length:         { control: 'text', description: 'Track width — number (px) or CSS string e.g. "50%"' },
  },
}

export default meta
type Story = StoryObj<typeof Slider>

/* ── Core states ── */

export const Default: Story = {
  args: {
    defaultValue: [0.5],
    min: 0,
    max: 1,
    step: 0.01,
  },
  decorators: [Story => <div style={{ width: 300 }}><Story /></div>],
}

export const WithValueBadge: Story = {
  name: 'With Value Badge',
  args: {
    defaultValue: [0.57],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
    valuePrecision: 2,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const WithLabel: Story = {
  name: 'With Label',
  args: {
    label: 'Grading Strength',
    defaultValue: [0.3],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const Disabled: Story = {
  args: {
    label: 'Disabled Slider',
    defaultValue: [0.4],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
    disabled: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

/* ── Range & min/max ── */

export const CustomRange: Story = {
  name: 'Custom Min / Max',
  args: {
    label: 'Num Tiles X',
    defaultValue: [24],
    min: 1,
    max: 100,
    step: 1,
    showValue: true,
    valuePrecision: 0,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const RangeSlider: Story = {
  name: 'Range (Two Thumbs)',
  args: {
    label: 'Tile range',
    defaultValue: [20, 80],
    min: 0,
    max: 100,
    step: 1,
    showValue: true,
    valuePrecision: 0,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const AtMinimum: Story = {
  name: 'Value at Minimum',
  args: {
    label: 'At minimum edge',
    defaultValue: [0],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const AtMaximum: Story = {
  name: 'Value at Maximum',
  args: {
    label: 'At maximum edge',
    defaultValue: [1],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

/* ── Length variants ── */

export const FixedLength: Story = {
  name: 'Fixed Length',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <Slider label="115px (Figma size)" defaultValue={[0.57]} showValue length={115} />
      <Slider label="200px"              defaultValue={[0.3]}  showValue length={200} />
      <Slider label="320px"             defaultValue={[0.7]}  showValue length={320} />
      <Slider label="50% of container"  defaultValue={[0.5]}  showValue length="50%" />
      <Slider label="100% (default)"    defaultValue={[0.4]}  showValue />
    </div>
  ),
}

/* ── Edge cases ── */

export const NoLabelNoBadge: Story = {
  name: 'Bare Track (no label, no badge)',
  args: {
    defaultValue: [0.5],
    min: 0,
    max: 1,
    step: 0.01,
  },
  decorators: [Story => <div style={{ width: 300 }}><Story /></div>],
}

export const LongLabel: Story = {
  name: 'Long Label Text',
  args: {
    label: 'Grading Smoothness (very long label to test layout wrapping behaviour)',
    defaultValue: [0.5],
    min: 0,
    max: 1,
    step: 0.01,
    showValue: true,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

export const CustomValueText: Story = {
  name: 'Custom aria-valuetext',
  args: {
    label: 'Num Tiles',
    defaultValue: [41],
    min: 1,
    max: 100,
    step: 1,
    showValue: true,
    valuePrecision: 0,
    getValueText: (v: number) => `${v} tiles`,
  },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
}

/* ── All variants overview ── */

export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 360, padding: 'var(--space-lg)' }}>
      <Slider label="Default"            defaultValue={[0.5]}      min={0} max={1}   step={0.01} />
      <Slider label="With badge"         defaultValue={[0.57]}     min={0} max={1}   step={0.01} showValue valuePrecision={2} />
      <Slider label="Grading Smoothness" defaultValue={[0.17]}     min={0} max={1}   step={0.01} showValue valuePrecision={2} />
      <Slider label="Num Tiles (1–100)"  defaultValue={[41]}       min={1} max={100} step={1}    showValue valuePrecision={0} />
      <Slider label="Range"              defaultValue={[20, 80]}   min={0} max={100} step={1}    showValue valuePrecision={0} />
      <Slider label="At minimum"         defaultValue={[0]}        min={0} max={1}   step={0.01} showValue />
      <Slider label="At maximum"         defaultValue={[1]}        min={0} max={1}   step={0.01} showValue />
      <Slider label="Disabled"           defaultValue={[0.6]}      min={0} max={1}   step={0.01} showValue disabled />
    </div>
  ),
}
