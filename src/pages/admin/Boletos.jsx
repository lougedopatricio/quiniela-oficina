import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import {
  getTemporada, getJornadas, getJugadores, getBoletosDeJornada,
  guardarBoleto, borrarBoleto, recalcularJornada,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio, Persona } from '../../components/ui.jsx'

const VACIA = Array(14).fill('-')

export default function Boletos() {
  const [roundId, setRoundId] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [editando, setEditando] = useState(null)   // { id?, player_id, picks }
  const [aviso, setAviso] = useState(null)

  const base = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [jornadas, jugadores] = await Promise.all([getJornadas(season.id), getJugadores()])
    return { jornadas, jugadores }
  }, [])

  const lista = useAsync(
    () => (roundId ? getBoletosDeJornada(roundId) : Promise.resolve([])),
    [roundId, recarga]
  )

  if (base.cargando) return <Cargando filas={4} />
  if (base.error) return <AvisoError error={base.error} />
  if (!base.datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { jornadas, jugadores } = base.datos
  const boletos = lista.datos ?? []
  const refrescar = () => setRecarga(n => n + 1)
  const fallo = (e) => setAviso({ tipo: 'error', txt: e.message })

  // Quien todavía no ha jugado esta jornada. Evita dar de alta dos columnas
  // a la misma persona, que la base rechazaría igualmente por el índice único.
  const yaJuegan = new Set(boletos.map(b => b.player_id))
  const disponibles = jugadores.filter(j => !yaJuegan.has(j.id) || editando?.player_id === j.id)

  async function guardar() {
    if (editando.picks.includes('-')) {
      return setAviso({ tipo: 'error', txt: 'La columna tiene huecos: hacen falta los 14 signos.' })
    }
    try {
      await guardarBoleto({ ...editando, round_id: roundId })
      setEditando(null)
      await recalcularJornada(roundId).catch(() => {})   // puntúa si ya hay signos
      refrescar()
    } catch (e) { fallo(e) }
  }

  async function borrar(b) {
    if (!confirm('¿Borrar este boleto?')) return
    try {
      await borrarBoleto(b.id)
      await recalcularJornada(roundId).catch(() => {})
      refrescar()
    } catch (e) { fallo(e) }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Boletos, uno a uno"
        entradilla="Para cargar una jornada entera es mejor el importador de Excel. Esto es para los retoques: el que entregó tarde, el que se equivocó al dictar, el que hay que quitar."
      />

      {aviso && <div className="aviso" style={{ marginTop: 20 }}>{aviso.txt}</div>}

      <Seccion titulo="Elige la jornada">
        <div style={{ padding: '14px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={roundId} onChange={e => { setRoundId(e.target.value); setEditando(null) }}>
            <option value="">Elige una…</option>
            {jornadas.map(j => (
              <option key={j.round_id} value={j.round_id}>
                Jornada {j.numero} · {j.estado} · {j.boletos} boletos
              </option>
            ))}
          </select>
          {roundId && !editando && (
            <button className="principal"
                    onClick={() => setEditando({ player_id: disponibles[0]?.id ?? '', picks: [...VACIA] })}
                    disabled={disponibles.length === 0}>
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Añadir boleto
            </button>
          )}
        </div>
      </Seccion>

      {editando && (
        <Seccion titulo={editando.id ? 'Editar boleto' : 'Nuevo boleto'}
                 accion={
                   <>
                     <button className="principal" onClick={guardar}>Guardar</button>
                     <button onClick={() => setEditando(null)} style={{ marginLeft: 6 }}>Cancelar</button>
                   </>
                 }>
          <div style={{ padding: '14px 0', display: 'grid', gap: 14 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="rotulo">Participante</span>
              <select value={editando.player_id} disabled={!!editando.id}
                      onChange={e => setEditando({ ...editando, player_id: e.target.value })}>
                {disponibles.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
            </label>

            <div style={{ display: 'grid', gap: 6 }}>
              <span className="rotulo">Columna</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {editando.picks.map((p, i) => (
                  <div key={i} style={{ display: 'grid', gap: 3, justifyItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: 'var(--tinta-3)', fontFamily: 'var(--mono)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{ display: 'grid', gap: 2 }}>
                      {['1', 'X', '2'].map(s => (
                        <button key={s} type="button"
                                onClick={() => {
                                  const picks = [...editando.picks]
                                  picks[i] = picks[i] === s ? '-' : s
                                  setEditando({ ...editando, picks })
                                }}
                                style={{
                                  padding: '3px 8px', fontSize: 12, lineHeight: 1.3,
                                  background: p === s ? 'var(--tinta)' : 'transparent',
                                  color: p === s ? 'var(--papel)' : 'var(--tinta-3)',
                                  borderColor: p === s ? 'var(--tinta)' : 'var(--regla)',
                                }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Seccion>
      )}

      {roundId && (
        <Seccion titulo="Boletos de esta jornada" nota={`${boletos.length} en total`}>
          {lista.cargando ? <Cargando filas={3} />
            : boletos.length === 0 ? <Vacio>Todavía no hay boletos en esta jornada.</Vacio>
            : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Columna</th>
                      <th>Origen</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {boletos.map(b => (
                      <tr key={b.id}>
                        <td><Persona nombre={b.players?.nombre ?? b.nombre ?? '—'} /></td>
                        <td>
                          <div className="tira-signos">
                            {b.picks.map((p, i) => <span key={i} className="signo">{p}</span>)}
                          </div>
                        </td>
                        <td><span className="etiqueta">{b.origen}</span></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button style={{ padding: '5px 9px' }}
                                  onClick={() => setEditando({ id: b.id, player_id: b.player_id, picks: [...b.picks] })}>
                            Editar
                          </button>
                          <button style={{ padding: '5px 9px', marginLeft: 4 }} onClick={() => borrar(b)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Seccion>
      )}
    </>
  )
}
