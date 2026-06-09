import { CROSS, CROSS_DIAGONAL, DIAGONAL, EXTRUSION, REVOLUTION, RULING, type TileDef } from "./lib/parameters";


interface CalcModeDef { label: string} 
export const CALC_MODE_DEFS: Record<string, CalcModeDef> = {
    [EXTRUSION]: { label: 'Extrusion' },
    [REVOLUTION]: { label: 'Revolution' },
    [RULING]: { label: 'Ruling' },
}

export type CalcMode = keyof typeof CALC_MODE_DEFS

import crossImg from './assets/TileTypes/cross.png'
import diagonalImg from './assets/TileTypes/diagonal.png'
import crossDiagonalImg from './assets/TileTypes/cross-diagonal.png'

export const TILE_DEFS: Record<string, TileDef> = {
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
}

export type TileType = keyof typeof TILE_DEFS
