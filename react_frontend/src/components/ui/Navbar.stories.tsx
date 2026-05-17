import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Navbar } from './Navbar'

const meta: Meta<typeof Navbar> = {
  title: 'UI/Navbar',
  component: Navbar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Two-tone navigation bar matching the Figma spec. ' +
          'A 7px navy top stripe carries the white active-page indicator; ' +
          'the 44px blue bar holds the page links.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    activePage: { control: 'radio', options: ['home', 'tool'] },
  },
}

export default meta
type Story = StoryObj<typeof Navbar>

export const HomeActive: Story = {
  name: 'Home active',
  args: { activePage: 'home' },
}

export const ToolActive: Story = {
  name: 'Lattice Maker Tool active',
  args: { activePage: 'tool' },
}

export const Interactive: Story = {
  name: 'Interactive (click to switch)',
  render: () => {
    const [page, setPage] = useState<'home' | 'tool'>('home')
    return (
      <div>
        <Navbar activePage={page} onNavigate={setPage} />
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-size-sm)',
          color: 'var(--text-secondary)',
          padding: 'var(--space-lg)',
        }}>
          Current page: <strong>{page}</strong>
        </p>
      </div>
    )
  },
}
