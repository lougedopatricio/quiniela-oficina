import { useEffect, useState } from 'react'
import { iniciales, euros, claseDinero } from '../lib/formato.js'

/** Carga asíncrona con estados de carga y error, para no repetirlo en cada pantalla. */
export function useAsync(fn, deps = []) {
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null })
  useEffect(() => {
    let vivo = true
    setEstado(e => ({ ...e, cargando: true }))
    Promise.resolve()
      .then(fn)
      .then(datos => vivo && setEstado({ cargando: false, error: null, datos }))
      .catch(error => vivo && setEstado({ cargando: false, error, datos: null }))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return estado
}

export const Cargando = ({ filas = 4 }) => (
  <div className="cargando">
    {Array.from({ length: filas }, (_, i) => <div key={i} className="esqueleto" />)}
  </div>
)

export const Vacio = ({ children }) => <div className="vacio">{children}</div>

export const AvisoError = ({ error }) => (
  <div className="aviso">
    <strong>No se han podido cargar los datos.</strong>
    <div style={{ marginTop: 4, color: 'var(--texto-suave)' }}>{error?.message}</div>
  </div>
)

export const Dato = ({ etiqueta, valor, nota, color }) => (
  <div className="tarjeta dato">
    <div className="etiqueta">{etiqueta}</div>
    <div className="valor" style={color ? { color } : undefined}>{valor}</div>
    {nota && <div className="nota">{nota}</div>}
  </div>
)

export const Persona = ({ nombre }) => (
  <div className="persona">
    <div className="avatar">{iniciales(nombre)}</div>
    <span>{nombre}</span>
  </div>
)

export const Puesto = ({ n }) => (
  <span className={`puesto ${n <= 3 ? `p${n}` : ''}`}>{n}</span>
)

export const Dinero = ({ cents, conSigno = false }) => (
  <span className={`dinero ${claseDinero(cents)}`}>
    {conSigno && cents > 0 ? '+' : ''}{euros(cents)}
  </span>
)

/** La columna de 14 signos, coloreada contra el resultado si ya se conoce. */
export const TiraSignos = ({ picks = [], signos = [] }) => (
  <div className="tira-signos">
    {picks.slice(0, 14).map((p, i) => {
      const s = signos[i]
      const clase = !s ? 'vacio' : p === s ? 'acierto' : 'fallo'
      return <span key={i} className={`signo ${clase}`}>{p}</span>
    })}
  </div>
)
