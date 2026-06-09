export const EXTRUSION = 'extrusion'
export const REVOLUTION = 'revolution'
export const RULING = 'ruling'

export const CROSS = 'cross'
export const DIAGONAL = 'diagonal'
export const CROSS_DIAGONAL = 'cross_diagonal'

//Permitted calculation modes:
export const CALC_MODES = [EXTRUSION, REVOLUTION, RULING] as const
export type CalcMode = typeof CALC_MODES[number]

interface CalcModeDef { label: string }

// Actualy used calculation modes
export const CALC_MODE_DEFS: Record<CalcMode, CalcModeDef> = {
    [EXTRUSION]:  { label: 'Extrusion' },
    [REVOLUTION]: { label: 'Revolution' },
    [RULING]:     { label: 'Ruling' },
}


export const DEFAULT_CALC_MODE: CalcMode = EXTRUSION

//Calculation parameters:
export const DEFAULT_X_COUNT = 3
export const DEFAULT_Y_COUNT = 3
export const DEFAULT_Z_COUNT = 3
export const DEFAULT_G1 = 0.57
export const DEFAULT_G2 = 0.83

//UI parameters:
export const DEFAULT_CAMERA_MODE = 'perspective' as const
export const DEFAULT_ZOOM = 100
export const DEFAULT_LATTICE_MENU_OPEN = true
export const DEFAULT_TILE_MENU_OPEN = true
export const INITIAL_VIEWER_RESET_KEY = 'initial'



//Tile types and parameters:

export const TILE_TYPES = [CROSS, DIAGONAL, CROSS_DIAGONAL, 'yaniv'] as const
export type TileType = typeof TILE_TYPES[number]
export const DEFAULT_TILE_TYPE: TileType = DIAGONAL

import crossImg from '../assets/TileTypes/cross.png'
import diagonalImg from '../assets/TileTypes/diagonal.png'
import crossDiagonalImg from '../assets/TileTypes/cross-diagonal.png'

interface TileDef {
    label: string
    imageUrl: string
    sliders: SliderDef[]
}

export interface SliderDef {
    label: string
    min: number
    max: number
    defaultValue: number
    step: number
}

export const TILE_DEFS: Record<TileType, TileDef> = {
    [CROSS]: {
        label: 'Cross',
        imageUrl: crossImg,
        sliders: [
            { label: 'Outer Radius', min: 0.01, max: 0.5, defaultValue: 0.3, step: 0.01 },
            { label: 'Inner Radius', min: 0.0, max: 0.5, defaultValue: 0.15, step: 0.01 },
        ],
    },
    [DIAGONAL]: {
        label: 'Diagonal',
        imageUrl: diagonalImg,
        sliders: [
            { label: 'Center Size', min: 0.01, max: 0.5, defaultValue: 0.25, step: 0.01 },
            { label: 'End-Arm Size', min: 0.01, max: 0.5, defaultValue: 0.25, step: 0.01 },
            { label: 'Smoothing of Arms', min: 0.0, max: 1.0, defaultValue: 0.3, step: 0.01 },
        ],
    },
    [CROSS_DIAGONAL]: {
        label: 'Cross Diagonal',
        imageUrl: crossDiagonalImg,
        sliders: [
            { label: 'Cross Radius', min: 0.01, max: 0.5, defaultValue: 0.2, step: 0.01 },
            { label: 'Diagonal Relative Radius', min: 0.01, max: 2.0, defaultValue: 0.5, step: 0.01 },
        ],
    },
    yaniv: {
        label: 'YANIV',
        imageUrl: crossDiagonalImg,
        sliders: [
            { label: 'Cross Radius', min: 0.01, max: 0.5, defaultValue: 0.2, step: 0.01 },
        ],
    }
}