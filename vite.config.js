import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio bajo /<nombre-del-repo>/, así que los assets
// necesitan ese prefijo. En `dev` se sirve desde la raíz.
// Si algún día se publica en un dominio propio, basta con poner BASE_PATH=/ .
const base = process.env.BASE_PATH ?? '/quiniela-oficina/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? base : '/',
  plugins: [react()],
  // Sin puerto fijo: se respeta PORT si viene del entorno, para poder tener
  // varios proyectos levantados a la vez sin pisarse.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
}))
