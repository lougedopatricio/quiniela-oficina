// Todo el dinero circula en céntimos enteros. Estas son las únicas funciones
// que lo convierten a texto, para que no haya dos formatos distintos por ahí.

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const euros = (cents) => eur.format((cents ?? 0) / 100)

export const eurosConSigno = (cents) => (cents > 0 ? '+' : '') + eur.format((cents ?? 0) / 100)

export const claseDinero = (cents) => (cents > 0 ? 'positivo' : cents < 0 ? 'negativo' : '')

export const fechaCorta = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'

export const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()

/** «faltan 2 d 4 h» para las cuentas atrás de los plazos. */
export function cuentaAtras(iso) {
  if (!iso) return null
  const ms = new Date(iso) - Date.now()
  if (ms <= 0) return 'cerrado'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}
