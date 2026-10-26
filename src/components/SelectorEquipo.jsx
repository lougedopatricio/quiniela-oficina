import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Escudo } from './ui.jsx'
import { GRUPOS } from '../lib/divisiones.js'
import { sinAcentos } from '../lib/texto.js'

/**
 * Un selector de equipo que enseña los escudos: un `<select>` no puede pintar
 * imágenes, así que es un botón con el equipo elegido que abre una rejilla
 * por divisiones, con buscador. Lo escrito en el buscador también vale como
 * equipo, para el que no esté en ninguna lista.
 */
export default function SelectorEquipo({ valor, alCambiar, usados = new Set(), placeholder = 'Elegir equipo' }) {
  const [abierto, setAbierto] = useState(false)
  const [grupo, setGrupo] = useState('primera')
  const [busca, setBusca] = useState('')
  const caja = useRef(null)
  const campo = useRef(null)

  // Se cierra al pulsar fuera o con Escape, como un desplegable de verdad.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    campo.current?.focus()
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const elegir = (nombre) => { alCambiar(nombre); setAbierto(false); setBusca('') }
  const q = sinAcentos(busca)
  // Con algo escrito se busca en todas las divisiones a la vez.
  const lista = q
    ? GRUPOS.flatMap(g => g.equipos).filter(n => sinAcentos(n).includes(q))
    : GRUPOS.find(g => g.id === grupo).equipos

  return (
    <div className="selector-equipo" ref={caja}>
      <button type="button" className="selector-equipo__boton" onClick={() => setAbierto(a => !a)}>
        {valor
          ? <><Escudo nombre={valor} tamano={20} /><span className="selector-equipo__nombre">{valor}</span></>
          : <span style={{ color: 'var(--tinta-3)' }}>{placeholder}</span>}
        <ChevronDown size={14} style={{ marginLeft: 'auto', flex: 'none', color: 'var(--tinta-3)' }} />
      </button>

      {abierto && (
        <div className="selector-equipo__panel">
          <div className="selector-equipo__busca">
            <Search size={14} style={{ color: 'var(--tinta-3)' }} />
            <input ref={campo} value={busca} placeholder="Buscar o escribir otro equipo…"
                   onChange={e => setBusca(e.target.value)}
                   onKeyDown={e => {
                     if (e.key === 'Enter') {
                       e.preventDefault()
                       if (lista.length === 1) elegir(lista[0])
                       else if (busca.trim()) elegir(busca.trim())
                     }
                   }} />
          </div>
          {!q && (
            <div className="selector-equipo__pestanas">
              {GRUPOS.map(g => (
                <button key={g.id} type="button" className={grupo === g.id ? 'activo' : undefined}
                        onClick={() => setGrupo(g.id)}>{g.txt}</button>
              ))}
            </div>
          )}
          <div className="selector-equipo__rejilla">
            {lista.map(n => (
              <button key={n} type="button" onClick={() => elegir(n)}
                      className={`${n === valor ? 'elegido' : ''} ${usados.has(n) && n !== valor ? 'usado' : ''}`}
                      title={usados.has(n) && n !== valor ? `${n} ya juega en otro partido de esta jornada` : n}>
                <Escudo nombre={n} tamano={26} />
                <span>{n}</span>
              </button>
            ))}
          </div>
          {busca.trim() && !lista.some(n => sinAcentos(n) === q) && (
            <button type="button" className="selector-equipo__otro" onClick={() => elegir(busca.trim())}>
              Usar «{busca.trim()}» (sin escudo)
            </button>
          )}
          {valor && (
            <button type="button" className="selector-equipo__otro" onClick={() => elegir('')}>Quitar</button>
          )}
        </div>
      )}
    </div>
  )
}
