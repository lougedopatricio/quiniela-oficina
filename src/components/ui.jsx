import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
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
    <div style={{ marginTop: 4, color: 'var(--tinta-2)' }}>{error?.message}</div>
  </div>
)

/**
 * Cabecera de página, con la estructura de una portada: antetítulo, titular
 * que cuenta algo, y entradilla que sitúa.
 */
export const Portada = ({ antetitulo, titular, entradilla, children }) => (
  <header className="portada">
    {antetitulo && <div className="antetitulo">{antetitulo}</div>}
    <h1 className="titular">{titular}</h1>
    {entradilla && <p className="entradilla">{entradilla}</p>}
    {children}
  </header>
)

/** Las dos o tres cifras que de verdad importan en cada pantalla. */
export const Destacado = ({ rotulo, valor, nota, tono }) => (
  <div>
    <div className="rotulo">{rotulo}</div>
    <div className={`cifra-grande ${tono ?? ''}`}>{valor}</div>
    {nota && <div className="pie-cifra">{nota}</div>}
  </div>
)

/** Todo lo demás. Mismo dato, un tercio del peso visual. */
export const CifraMenor = ({ rotulo, valor, tono }) => (
  <div>
    <div className="rotulo">{rotulo}</div>
    <div className="valor" style={tono ? { color: tono } : undefined}>{valor}</div>
  </div>
)

export const Seccion = ({ titulo, nota, entradilla, accion, children }) => (
  <section className="seccion">
    <div className="seccion-cabecera">
      <h2>{titulo}</h2>
      {accion ?? (nota && <span className="nota">{nota}</span>)}
    </div>
    {entradilla && <p className="entradilla">{entradilla}</p>}
    {children}
  </section>
)

export const Persona = ({ nombre, mostrarInicial = true }) => (
  <div className="persona">
    {mostrarInicial && <div className="inicial">{iniciales(nombre)}</div>}
    <span className="nombre">{nombre}</span>
  </div>
)

export const Posicion = ({ n }) => (
  <span className={`posicion ${n === 1 ? 'p1' : ''}`}>{String(n).padStart(2, '0')}</span>
)

/** Medalla numerada, para cuando lo que se marca es un puesto del podio. */
export const Medalla = ({ puesto }) =>
  puesto <= 3 ? <span className={`medalla m${puesto}`} title={`${puesto}º`}>{puesto}</span> : null

/**
 * Marca de "ganó la jornada". Va SIN cifra a propósito: cuando se pone al lado
 * de un número (los aciertos, las victorias) una medalla numerada se lee como
 * un segundo dato y confunde.
 */
export const Ganador = () => (
  <Trophy size={13} strokeWidth={2.2} style={{ color: 'var(--oro)', flex: 'none' }} aria-label="Ganador" />
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
