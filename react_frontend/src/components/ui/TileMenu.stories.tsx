import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { TileMenu, defaultSliderValues } from './TileMenu'
import type { TileType } from '../../calculation_params'

const meta: Meta<typeof TileMenu> = {
  title: 'UI/TileMenu',
  component: TileMenu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Right-side panel for configuring tile parameters. ' +
          'Sliders are dynamic — the set shown depends on the selected tile type. ' +
          'The 166px preview updates live via calculateTile.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof TileMenu>

export const CrossDiagonal: Story = {
  name: 'Cross Diagonal (2 sliders)',
  render: () => {
    const [tileType, setTileType] = useState<TileType>('cross_diagonal')
    const [values, setValues] = useState(defaultSliderValues('cross_diagonal'))

    const handleTypeChange = (t: TileType) => {
      setTileType(t)
      setValues(defaultSliderValues(t))
    }

    return (
      <TileMenu
        tileType={tileType}
        sliderValues={values}
        onTileTypeChange={handleTypeChange}
        onSliderChange={setValues}
        onClose={() => alert('close')}
      />
    )
  },
}

export const Diagonal: Story = {
  name: 'Diagonal (3 sliders)',
  render: () => {
    const [tileType, setTileType] = useState<TileType>('diagonal')
    const [values, setValues] = useState(defaultSliderValues('diagonal'))

    const handleTypeChange = (t: TileType) => {
      setTileType(t)
      setValues(defaultSliderValues(t))
    }

    return (
      <TileMenu
        tileType={tileType}
        sliderValues={values}
        onTileTypeChange={handleTypeChange}
        onSliderChange={setValues}
        onClose={() => alert('close')}
      />
    )
  },
}

export const Cross: Story = {
  name: 'Cross (2 sliders, inner capped by outer)',
  render: () => {
    const [tileType, setTileType] = useState<TileType>('cross')
    const [values, setValues] = useState(defaultSliderValues('cross'))

    const handleTypeChange = (t: TileType) => {
      setTileType(t)
      setValues(defaultSliderValues(t))
    }

    return (
      <TileMenu
        tileType={tileType}
        sliderValues={values}
        onTileTypeChange={handleTypeChange}
        onSliderChange={setValues}
        onClose={() => alert('close')}
      />
    )
  },
}
