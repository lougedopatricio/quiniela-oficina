import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Shuffle } from 'lucide-react'
import {
  getTemporada, getJornadas, getPartidosDeJornada, crearJornada, actualizarJornada, ponerEquipos,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio } from '../../components/ui.jsx'
import SelectorEquipo from '../../components/SelectorEquipo.jsx'
import { TEMPORADA } from '../../lib/divisiones.js'
import { MODO_DEMO } from '../../lib/supabase.js'

const VACIOS = () => Array.from({ length: 15 }, (_, i) => ({ orden: i + 1, local: '', visitante: '', femenino: false }))

// El «(F)» va pegado al nombre, que es como lo escriben LAE y TuLotero y lo
// que distingue un Sevilla - Betis femenino del masculino en la misma jornada.
const conCategoria = (nombre, femenino) => (femenino && nombre ? `${nombre} (F)` : nombre)
const sinCategoria = (nombre) => String(nombre ?? '').replace(/\s*\((?:f|m)\)\s*$/i, '')

/**
 * Montar una quiniela en un minuto: los 15 partidos con dos selectores de
 * equipo cada uno, con sus escudos, para una jornada nueva o para una que
 * todavía no tenga los partidos puestos.
 */
export default function CrearQuiniela() {
  const [destino, setDestino] = useState('nueva')
  const [partidos, setPartidos] = useState(VACIOS)
  const [cierre, setCierre] = useState('')
  const [abrir, setAbrir] = useState(true)
  const [estado, setEstado] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [creada, setCreada] = useState(null)

  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    return { season, jornadas: await getJornadas(season.id) }
  }, [recarga])

  if (cargando && !datos) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta. Créala primero en Supabase.</Vacio>

  const { season, jornadas } = datos
  const siguiente = Math.max(0, ...jornadas.map(j => j.numero)) + 1
  const editables = jornadas.filter(j => j.estado !== 'finalizada')

  // Al elegir una jornada que ya existe, se cargan sus equipos para retocarlos.
  async function elegirDestino(valor) {
    setDestino(valor)
    setCreada(null)
    if (valor === 'nueva') return setPartidos(VACIOS())
    try {
      const ms = await getPartidosDeJornada(valor)
      setPartidos(VACIOS().map(p => {
        const m = ms.find(x => x.orden === p.orden)
        if (!m) return p
        const femenino = /\(f\)\s*$/i.test(m.local ?? '')
        return { ...p, local: sinCategoria(m.local), visitante: sinCategoria(m.visitante), femenino }
      }))
    } catch (e) { setEstado({ tipo: 'error', txt: e.message }) }
  }

  const cambiar = (orden, campo, valor) =>
    setPartidos(ps => ps.map(p => (p.orden === orden ? { ...p, [campo]: valor } : p)))

  // Un mismo club no juega dos partidos masculinos en la misma jornada: se
  // marca en el selector para no repetirlo sin querer, pero no se impide
  // (puede haber un partido femenino del mismo club).
  const usados = new Set(partidos.filter(p => !p.femenino).flatMap(p => [p.local, p.visitante]).filter(Boolean))
  const completos = partidos.filter(p => p.local && p.visitante).length

  async function guardar() {
    if (completos < 15 && !confirm(`Hay ${15 - completos} partido(s) sin completar. ¿Guardar igualmente? Se pueden rellenar después.`)) return
    setEstado({ tipo: 'trabajando', txt: 'Guardando…' })
    try {
      let roundId = destino
      let numero = jornadas.find(j => j.round_id === destino)?.numero
      if (destino === 'nueva') {
        const r = await crearJornada({
          season_id: season.id, numero: siguiente,
          cierra_at: cierre ? new Date(cierre).toISOString() : null,
        })
        roundId = r.id
        numero = siguiente
      } else if (cierre) {
        await actualizarJornada(roundId, { cierra_at: new Date(cierre).toISOString() })
      }
      await ponerEquipos(roundId, partidos
        .filter(p => p.local || p.visitante)
        .map(p => ({ orden: p.orden, local: conCategoria(p.local, p.femenino), visitante: conCategoria(p.visitante, p.femenino) })))
      if (abrir) await actualizarJornada(roundId, { estado: 'abierta' })
      setCreada({ roundId, numero })
      setEstado({ tipo: 'ok', txt: `Jornada ${numero} guardada${abrir ? ' y abierta: ya se puede jugar desde «Jugar»' : ''}.` })
      setDestino(roundId)
      setRecarga(n => n + 1)
    } catch (e) {
      setEstado({ tipo: 'error', txt: e.message })
    }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Crear una quiniela"
        entradilla={`Elige los quince partidos con sus escudos: Primera, Segunda o cualquier otro equipo que escribas. Las listas son las de la temporada ${TEMPORADA}.`}
      />

      {MODO_DEMO && (
        <div className="aviso" style={{ marginTop: 20 }}>
          <strong>Edición de muestra.</strong> Puedes probar los selectores, pero guardar está desactivado.
        </div>
      )}

      <Seccion titulo="La jornada">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end', padding: '14px 0' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Jornada</span>
            <select value={destino} onChange={e => elegirDestino(e.target.value)}>
              <option value="nueva">Nueva · jornada {siguiente}</option>
              {editables.map(j => (
                <option key={j.round_id} value={j.round_id}>Jornada {j.numero} · {j.estado}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Cierre para jugar (opcional)</span>
            <input type="datetime-local" value={cierre} onChange={e => setCierre(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, paddingBottom: 8 }}>
            <input type="checkbox" checked={abrir} onChange={e => setAbrir(e.target.checked)} style={{ width: 16, height: 16 }} />
            Abrirla para que se pueda jugar
          </label>
        </div>
      </Seccion>

      <Seccion
        titulo="Los partidos"
        nota={`${completos}/15 completos`}
        accion={
          <button className="principal" onClick={guardar} disabled={MODO_DEMO || estado?.tipo === 'trabajando'}>
            {destino === 'nueva' ? `Crear la jornada ${siguiente}` : 'Guardar los partidos'}
          </button>
        }
      >
        {estado && <div className="aviso" style={{ marginTop: 12 }}>{estado.txt}
          {creada && (
            <> · <Link to={`/imprimir/${creada.roundId}`} style={{ color: 'var(--rojo)', textDecoration: 'underline' }}>
              <Printer size={13} style={{ verticalAlign: -2 }} /> Imprimir los boletos</Link></>
          )}
        </div>}

        <div style={{ marginTop: 8 }}>
          {partidos.map(p => (
            <div key={p.orden} className="crear-fila">
              <span className="posicion" style={p.orden === 15 ? { color: 'var(--oro)', fontSize: 11 } : undefined}>
                {p.orden === 15 ? 'P15' : String(p.orden).padStart(2, '0')}
              </span>
              <SelectorEquipo valor={p.local} usados={usados} placeholder="Local"
                              alCambiar={v => cambiar(p.orden, 'local', v)} />
              <SelectorEquipo valor={p.visitante} usados={usados} placeholder="Visitante"
                              alCambiar={v => cambiar(p.orden, 'visitante', v)} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }} title="Partido femenino: se apunta con «(F)»">
                  <input type="checkbox" checked={p.femenino} style={{ width: 15, height: 15 }}
                         onChange={e => cambiar(p.orden, 'femenino', e.target.checked)} />
                  Fem.
                </label>
                <button type="button" title="Dar la vuelta: local ↔ visitante" style={{ padding: '4px 7px' }}
                        onClick={() => setPartidos(ps => ps.map(x => (x.orden === p.orden ? { ...x, local: x.visitante, visitante: x.local } : x)))}>
                  <Shuffle size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', marginTop: 10 }}>
          El 15 es el Pleno al 15. Los equipos que ya juegan otro partido salen atenuados en el
          selector. Los marcadores y los signos se meten luego, en Jornadas → Partidos.
        </p>
      </Seccion>
    </>
  )
}
