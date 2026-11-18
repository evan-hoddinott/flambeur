import type { Insert } from '../engine/shop.ts'

// the sprite ids for an insert's face and its scratcher symbol
export const insertFace = (id: Insert) => (id === 'foil' ? 'insert/face/foilwrap' : `insert/face/${id}`)
export const insertMark = (id: Insert) => (id === 'foil' ? 'scratch/foilwrap' : `scratch/${id}`)
