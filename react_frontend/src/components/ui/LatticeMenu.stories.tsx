import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { LatticeMenu } from './LatticeMenu'
import type { CalcMode } from '../../calculation_params'
import type { TileType } from '../../lib/parameters'

const meta: Meta<typeof LatticeMenu> = {
  title: 'UI/LatticeMenu',
  component: LatticeMenu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Left-side parameter panel. Collapses to a floating Menu icon button. ' +
          'Export is disabled until a calculation result is available.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof LatticeMenu>

function Demo({ initialOpen = true }: { initialOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [tileType] = useState<TileType>('diagonal')
  const [nt1, setNt1] = useState(10)
  const [nt2, setNt2] = useState(10)
  const [nt3, setNt3] = useState(10)
  const [g1, setG1] = useState(0.57)
  const [g2, setG2] = useState(0.83)
  const [mode, setMode] = useState<CalcMode>('extrusion')

  return (
    <LatticeMenu
      tileType={tileType}
      nt1={nt1} nt2={nt2} nt3={nt3}
      g1={g1} g2={g2}
      calculationMode={mode}
      canExport={false}
      isOpen={isOpen}
      onNt1Change={setNt1} onNt2Change={setNt2} onNt3Change={setNt3}
      onG1Change={setG1} onG2Change={setG2}
      onCalculationModeChange={setMode}
      onOpenTileMenu={() => alert('open tile menu')}
      onExportIgs={() => alert('export')}
      onExportStl={() => alert('export')}
      onToggle={() => setIsOpen(o => !o)}
    />
  )
}

export const Open: Story = {
  name: 'Open panel',
  render: () => <Demo initialOpen />,
}

export const Collapsed: Story = {
  name: 'Collapsed (icon only)',
  render: () => <Demo initialOpen={false} />,
}

export const ExportEnabled: Story = {
  name: 'Export enabled',
  render: () => {
    const [isOpen, setIsOpen] = useState(true)
    const [nt1, setNt1] = useState(10)
    const [nt2, setNt2] = useState(10)
    const [nt3, setNt3] = useState(10)
    const [g1, setG1] = useState(0.57)
    const [g2, setG2] = useState(0.83)
    const [mode, setMode] = useState<CalcMode>('extrusion')
    return (
      <LatticeMenu
        tileType="diagonal"
        nt1={nt1} nt2={nt2} nt3={nt3}
        g1={g1} g2={g2}
        calculationMode={mode}
        canExport
        isOpen={isOpen}
        onNt1Change={setNt1} onNt2Change={setNt2} onNt3Change={setNt3}
        onG1Change={setG1} onG2Change={setG2}
        onCalculationModeChange={setMode}
        onOpenTileMenu={() => {}}
        onExportIgs={() => alert('downloading...')}
        onExportStl={() => alert('downloading...')}
        onToggle={() => setIsOpen(o => !o)}
      />
    )
  },
}
