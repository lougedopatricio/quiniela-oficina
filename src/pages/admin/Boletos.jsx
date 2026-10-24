import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import {
  getTemporada, getJornadas, getJugadores, getBoletosDeJornada, getPartidosDeJornada,
  guardarBoleto, borrarBoleto, recalcularJornada,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio, Persona } from '../../components/ui.jsx'

const SIGNOS = ['1', 'X', '2']
const GOLES = ['0', '1', '2', 'M']

/**
 * La columna tiene tantas casillas como partidos la jornada —14 o 15, desde
 * que existe el Pleno al 15 (0013)—, nunca menos de 14. Un boleto viejo de 14
 * se alarga con huecos para que el 15 se pueda rellenar al editarlo.
 */
const columnaPara = (partidos, picks = []) =>
  Array.from({ length: Math.max(14, partidos.length, picks.length) }, (_, i) => picks[i] ?? '-')

export default function Boletos() {
  const [roundId, setRoundId] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [editando, setEditando] = useState(null)   // { id?, player_id, picks, pleno_local, pleno_visitante }
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
  const calendario = useAsync(
    () => (roundId ? getPartidosDeJornada(roundId) : Promise.resolve([])),
    [roundId]
  )

  if (base.cargando) return <Cargando filas={4} />
  if (base.error) return <AvisoError error={base.error} />
  if (!base.datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { jornadas, jugadores } = base.datos
  const boletos = lista.datos ?? []
  const partidos = calendario.datos ?? []
  const partidoDe = Object.fromEntries(partidos.map(m => [m.orden, m]))
  // El pleno que se juega con goles, como en «Jugar». Si se juega por signo,
  // es una casilla 1/X/2 más y no necesita nada aparte.
  const pleno = partidos.find(m => m.modo_puntuacion === 'pleno' && m.exige_resultado)
  const pideSigno = (orden) => {
    const m = partidoDe[orden]
    if (!m) return orden <= 14    // jornada sin partidos todavía: los 14 de siempre
    return m.modo_puntuacion !== 'no_puntua' && m !== pleno
  }
  const refrescar = () => setRecarga(n => n + 1)
  const fallo = (e) => setAviso({ tipo: 'error', txt: e.message })

  // Quien todavía no ha jugado esta jornada. Evita dar de alta dos columnas
  // a la misma persona, que la base rechazaría igualmente por el índice único.
  const yaJuegan = new Set(boletos.map(b => b.player_id))
  const disponibles = jugadores.filter(j => !yaJuegan.has(j.id) || editando?.player_id === j.id)

  // Puntúa si ya hay signos. El caso benigno —"jornada sin liquidar, faltan
  // signos"— no lanza: recalcularJornada() lo devuelve como dato normal (ver
  // JornadasAdmin.jsx). Si SÍ lanza es un fallo real, y antes se tragaba
  // entero: el boleto quedaba guardado o borrado, pero sin avisar de que la
  // clasificación no se había vuelto a calcular.
  async function recalcularSinBloquear(txtOk) {
    try {
      await recalcularJornada(roundId)
      setAviso({ tipo: 'ok', txt: txtOk })
    } catch (e) {
      setAviso({ tipo: 'error', txt: `${txtOk}, pero no se ha podido recalcular la jornada: ${e.message}` })
    }
  }

  const nuevo = (b) => setEditando({
    id: b?.id, player_id: b?.player_id ?? disponibles[0]?.id ?? '',
    picks: columnaPara(partidos, b?.picks),
    pleno_local: b?.pleno_local ?? '', pleno_visitante: b?.pleno_visitante ?? '',
  })

  async function guardar() {
    const huecos = editando.picks
      .map((p, i) => (p === '-' && pideSigno(i + 1) ? i + 1 : null))
      .filter(Boolean)
    if (huecos.length) {
      return setAviso({ tipo: 'error', txt: `Faltan signos en ${huecos.length === 1 ? 'el partido' : 'los partidos'} ${huecos.join(', ')}.` })
    }
    if (pleno && !(editando.pleno_local && editando.pleno_visitante)) {
      return setAviso({ tipo: 'error', txt: 'Falta el resultado del Pleno al 15: los goles de los dos equipos.' })
    }
    try {
      await guardarBoleto({ ...editando, round_id: roundId })
      setEditando(null)
      refrescar()
      await recalcularSinBloquear('Boleto guardado')
    } catch (e) { fallo(e) }
  }

  async function borrar(b) {
    if (!confirm('¿Borrar este boleto?')) return
    try {
      await borrarBoleto(b.id)
      refrescar()
      await recalcularSinBloquear('Boleto borrado')
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
                    onClick={() => nuevo()}
                    disabled={disponibles.length === 0 || calendario.cargando}>
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
                  <div key={i} style={{ display: 'grid', gap: 3, justifyItems: 'center', alignContent: 'start' }}
                       title={partidoDe[i + 1] ? `${partidoDe[i + 1].local} – ${partidoDe[i + 1].visitante}` : undefined}>
                    <span style={{ fontSize: 10.5, color: i === 14 ? 'var(--oro)' : 'var(--tinta-3)', fontFamily: 'var(--mono)' }}>
                      {i === 14 ? 'P15' : String(i + 1).padStart(2, '0')}
                    </span>
                    {!pideSigno(i + 1) ? (
                      <span style={{ fontSize: 11, color: 'var(--tinta-3)', paddingTop: 4 }}>
                        {partidoDe[i + 1] === pleno ? 'goles ↓' : 'no puntúa'}
                      </span>
                    ) : (
                    <div style={{ display: 'grid', gap: 2 }}>
                      {SIGNOS.map(s => (
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
                    )}
                  </div>
                ))}
              </div>
            </div>

            {pleno && (
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="rotulo" style={{ color: 'var(--oro)' }}>
                  Pleno al 15 · {pleno.local} – {pleno.visitante}
                </span>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                  {[['pleno_local', pleno.local], ['pleno_visitante', pleno.visitante]].map(([campo, equipo]) => (
                    <div key={campo} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--tinta-2)', marginRight: 6 }}>{equipo}</span>
                      {GOLES.map(g => (
                        <button key={g} type="button"
                                onClick={() => setEditando(e => ({ ...e, [campo]: e[campo] === g ? '' : g }))}
                                style={{
                                  padding: '3px 9px', fontSize: 12,
                                  background: editando[campo] === g ? 'var(--oro)' : 'transparent',
                                  color: editando[campo] === g ? '#fff' : 'var(--tinta-3)',
                                  borderColor: editando[campo] === g ? 'var(--oro)' : 'var(--regla)',
                                }}>
                          {g}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--tinta-3)' }}>«M» vale por tres goles o más.</span>
              </div>
            )}
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
                            {b.pleno_local && (
                              <span className="signo" style={{ width: 'auto', padding: '0 5px' }} title="Pleno al 15">
                                {b.pleno_local}-{b.pleno_visitante}
                              </span>
                            )}
                          </div>
                        </td>
                        <td><span className="etiqueta">{b.origen}</span></td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                          <button style={{ padding: '5px 9px' }}
                                  onClick={() => nuevo(b)}>
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
