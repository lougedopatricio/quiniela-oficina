// Todo el dinero circula en céntimos enteros. Estas son las únicas funciones
// que lo convierten a texto, para que no haya dos formatos distintos por ahí.

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const euros = (cents) => eur.format((cents ?? 0) / 100)

export const eurosConSigno = (cents) => (cents > 0 ? '+' : '') + eur.format((cents ?? 0) / 100)

export const claseDinero = (cents) => (cents > 0 ? 'positivo' : cents < 0 ? 'negativo' : '')

/** Decimales a la española: 11,17 y no 11.17 ni un 8 pelado donde va 8,00. */
export const decimal = (n, d = 2) =>
  (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fechaCorta = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—'

export const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Cómo sale alguien en las pantallas públicas: su apodo si se lo ha puesto
 * (0016), su nombre si no. `nombre` puede venir sacado del correo al dar de
 * alta una cuenta suelta, y no tiene por qué ser lo que uno quiere ver en la
 * clasificación.
 */
export const nombreVisible = (p) => p?.apodo?.trim() || p?.nombre || '—'

export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase()

/** «hace 3 h», «hace 2 d»: para saber de un vistazo quién sigue entrando. */
export function haceCuanto(iso) {
  if (!iso) return null
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000))
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 60) return `hace ${d} d`
  return `hace ${Math.floor(d / 30)} meses`
}

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
