// react_frontend/src/components/ui/CalculationOverlay.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { CalculationOverlay } from './CalculationOverlay'

const meta: Meta<typeof CalculationOverlay> = {
  title: 'UI/CalculationOverlay',
  component: CalculationOverlay,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof CalculationOverlay>

export const Waiting: Story = {
  args: {
    isOpen: true,
    phase: 'waiting',
    waitingText: "Site is busy — you're #2 in line",
  },
}

export const Calculating: Story = {
  args: {
    isOpen: true,
    phase: 'calculating',
    waitingText: '',
  },
}

export const Finalizing: Story = {
  args: {
    isOpen: true,
    phase: 'finalizing',
    waitingText: '',
  },
}

export const Closed: Story = {
  args: {
    isOpen: false,
    phase: 'calculating',
    waitingText: '',
  },
}
