// ---------------------------------------------------------------------------
// Las marcas con las que cada uno rellena su boleto (0028).
//
// Cada una son trazos en un lienzo de 40×40, como si se hicieran a boli sobre
// la casilla: `t` son trazos (se dibujan con animación de bolígrafo) y `r`
// rellenos (manchas de tinta). La lista manda también en la base: el test
// marca.test.mjs comprueba que el CHECK de 0028 acepta justo estas.
// ---------------------------------------------------------------------------

const estrella = (() => {
  const p = []
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * Math.PI / 180
    const r = i % 2 ? 6.5 : 15.5
    p.push(`${(20 + r * Math.cos(a)).toFixed(1)} ${(21 + r * Math.sin(a)).toFixed(1)}`)
  }
  return `M${p.join(' L')} Z`
})()

export const MARCAS = [
  { id: 'cruz', txt: 'Cruz', t: ['M8 8 Q20 19 32 32', 'M32 7 Q19 21 8 32'] },
  { id: 'circulo', txt: 'Círculo', t: ['M21 5 C31 5 36 12 35 21 C34 31 26 36 18 35 C9 34 4 27 5 19 C6 10 13 5 23 7'] },
  { id: 'tachon', txt: 'Tachar la casilla', t: ['M3 6 L37 4 L3 12 L37 10 L3 18 L37 16 L3 24 L37 22 L3 30 L37 28 L3 36 L37 35'] },
  { id: 'relleno', txt: 'Rellenar entera', r: ['M3 4 L37 3 L36 37 L4 36 Z'] },
  { id: 'check', txt: 'Visto bueno', t: ['M6 21 L16 32 L35 6'] },
  { id: 'estrella', txt: 'Estrella', t: [estrella] },
  {
    id: 'pez', txt: 'Pez',
    t: ['M5 20 C11 9 25 9 30 20 C25 31 11 31 5 20 Z', 'M30 20 L37 12 L36 28 Z', 'M17 14 Q20 20 17 26'],
    r: ['M11 18 a1.8 1.8 0 1 0 0.1 0 Z'],
  },
  { id: 'corazon', txt: 'Corazón', t: ['M20 34 C6 25 2 15 9 9 C14 5 19 8 20 13 C21 8 26 5 31 9 C38 15 34 25 20 34 Z'] },
  {
    id: 'balon', txt: 'Balón',
    t: ['M20 5 C29 5 35 12 35 20 C35 29 28 35 20 35 C11 35 5 29 5 20 C5 12 12 5 20 5 Z',
        'M20 14 L20 7', 'M26 18 L33 15', 'M24 25 L28 31', 'M16 25 L12 31', 'M14 18 L7 15'],
    r: ['M20 14 L26 18 L24 25 L16 25 L14 18 Z'],
  },
  { id: 'rayo', txt: 'Rayo', t: ['M24 3 L9 22 L19 22 L14 37 L31 15 L21 15 L26 3 Z'] },
  { id: 'corona', txt: 'Corona', t: ['M6 29 L7 11 L14 20 L20 7 L26 20 L33 11 L34 29 Z', 'M6 33 L34 33'] },
  {
    id: 'carita', txt: 'Carita sonriente',
    t: ['M20 5 C29 5 35 12 35 20 C35 29 28 35 20 35 C11 35 5 29 5 20 C5 12 12 5 20 5 Z', 'M12 23 Q20 31 28 23'],
    r: ['M14 15 a2 2 0 1 0 0.1 0 Z', 'M26 15 a2 2 0 1 0 0.1 0 Z'],
  },
  {
    id: 'gato', txt: 'Gato',
    t: ['M8 33 C5 24 6 17 9 13 L8 4 L15 10 C18 9 22 9 25 10 L32 4 L31 13 C34 17 35 24 32 33 Z',
        'M17 25 L20 27 L23 25', 'M4 23 L12 24', 'M4 28 L12 27', 'M36 23 L28 24', 'M36 28 L28 27'],
    r: ['M15 19 a1.8 1.8 0 1 0 0.1 0 Z', 'M25 19 a1.8 1.8 0 1 0 0.1 0 Z'],
  },
  { id: 'garabato', txt: 'Garabato', t: ['M6 30 C2 18 14 4 22 10 C30 16 10 26 16 30 C22 34 34 18 30 10 C27 5 20 16 26 22 C31 27 36 28 35 33'] },
]

export const MARCA_POR_DEFECTO = 'cruz'
export const marcaDe = (id) => MARCAS.find(m => m.id === id) ?? MARCAS[0]
