import { useState } from 'react'
import { Plus, Trash2, RefreshCw, Download } from 'lucide-react'
import {
  getTemporada, getJornadas, getJornada, crearJornada, actualizarJornada,
  borrarJornada, guardarPartidos, recalcularJornada, sincronizarConLae,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio } from '../../components/ui.jsx'
import { euros, fechaCorta } from '../../lib/formato.js'

const ESTADOS = ['borrador', 'abierta', 'cerrada', 'en_juego', 'finalizada']

export default function JornadasAdmin() {
  const [recarga, setRecarga] = useState(0)
  const [abierta, setAbierta] = useState(null)   // id de la jornada desplegada
  const [aviso, setAviso] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)

  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    return { season, jornadas: await getJornadas(season.id) }
  }, [recarga])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { season, jornadas } = datos
  const refrescar = () => setRecarga(n => n + 1)
  const fallo = (e) => setAviso({ tipo: 'error', txt: e.message })

  async function nueva() {
    try {
      const siguiente = Math.max(0, ...jornadas.map(j => j.numero)) + 1
      await crearJornada({ season_id: season.id, numero: siguiente })
      setAviso({ tipo: 'ok', txt: `Jornada ${siguiente} creada con sus 15 huecos de partido.` })
      refrescar()
    } catch (e) { fallo(e) }
  }

  async function sincronizar() {
    setSincronizando(true)
    try {
      await sincronizarConLae()
      setAviso({
        tipo: 'ok',
        txt: 'Sincronización solicitada. Tarda uno o dos minutos en terminar — vuelve a esta pantalla luego, o mira el progreso en GitHub → Actions.',
      })
    } catch (e) { fallo(e) } finally { setSincronizando(false) }
  }

  async function cambiarEstado(j, estado) {
    try { await actualizarJornada(j.round_id, { estado }); refrescar() } catch (e) { fallo(e) }
  }

  async function borrar(j) {
    if (!confirm(`¿Borrar la jornada ${j.numero}? Se irán sus partidos, sus boletos y su reparto de dinero.`)) return
    try { await borrarJornada(j.round_id); refrescar() } catch (e) { fallo(e) }
  }

  async function recalcular(j) {
    try {
      const r = await recalcularJornada(j.round_id)
      setAviso({
        tipo: 'ok',
        txt: r?.liquidada
          ? `Jornada ${j.numero} liquidada: ${r.ganadores} ganador(es) con ${r.max_aciertos} aciertos, ${euros(r.premio_cents)} de premio.`
          : `Jornada ${j.numero} sin liquidar (${r?.motivo === 'faltan_signos' ? `solo hay ${r.signos_publicados} de 14 signos` : r?.motivo}).`,
      })
      refrescar()
    } catch (e) { fallo(e) }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Las jornadas y sus resultados"
        entradilla="Aquí se crean jornadas a mano, se corrigen signos que hayan entrado mal y se vuelve a repartir. El recálculo es idempotente: puedes lanzarlo las veces que haga falta sin que se dupliquen cuotas ni premios."
      >
        <button onClick={sincronizar} disabled={sincronizando} style={{ marginTop: 4 }}
                title="Vuelve a pedirle a LAE los partidos y resultados ahora mismo, sin esperar al cron automático">
          <Download size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          {sincronizando ? 'Pidiendo la sincronización…' : 'Sincronizar con LAE ahora'}
        </button>
      </Portada>

      {aviso && <div className="aviso" style={{ marginTop: 20 }}>{aviso.txt}</div>}

      <Seccion titulo="Jornadas"
               accion={<button className="principal" onClick={nueva}>
                 <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Nueva jornada
               </button>}>
        {jornadas.length === 0 ? (
          <Vacio>Todavía no hay ninguna jornada.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Jornada</th>
                  <th>Estado</th>
                  <th className="num">Boletos</th>
                  <th className="num">Recaudado</th>
                  <th className="num">Mejor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jornadas.map(j => (
                  <tr key={j.round_id}>
                    <td>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>Jornada {j.numero}</span>
                      <div style={{ color: 'var(--tinta-3)', fontSize: 12 }}>{fechaCorta(j.cierra_at)}</div>
                    </td>
                    <td>
                      <select value={j.estado} onChange={e => cambiarEstado(j, e.target.value)}
                              style={{ fontSize: 13, padding: '5px 8px' }}>
                        {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="num">{j.boletos}</td>
                    <td className="num">{euros(j.recaudacion_cents)}</td>
                    <td className="num destaca">{j.mejor_puntuacion ?? '—'}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button style={{ padding: '5px 9px' }}
                              onClick={() => setAbierta(abierta === j.round_id ? null : j.round_id)}>
                        {abierta === j.round_id ? 'Cerrar' : 'Partidos'}
                      </button>
                      <button style={{ padding: '5px 9px', marginLeft: 4 }} onClick={() => recalcular(j)}
                              title="Volver a puntuar y repartir">
                        <RefreshCw size={14} />
                      </button>
                      <button style={{ padding: '5px 9px', marginLeft: 4 }} onClick={() => borrar(j)}>
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

      {abierta && <EditorPartidos roundId={abierta} alGuardar={refrescar} alFallar={fallo} />}
    </>
  )
}

/** Edición de los 15 partidos: equipos, marcador y signo oficial. */
function EditorPartidos({ roundId, alGuardar, alFallar }) {
  const [borrador, setBorrador] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const { cargando, error, datos } = useAsync(() => getJornada(roundId), [roundId])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />

  const partidos = borrador ?? datos.partidos
  const cambiar = (orden, campo, valor) =>
    setBorrador(partidos.map(m => (m.orden === orden ? { ...m, [campo]: valor } : m)))

  // Marca o desmarca un partido como sustituido a mano. Al marcarlo, se
  // guarda el enfrentamiento oficial que había antes de tocarlo, para que
  // quede constancia de qué se cambió. Es por partido, no por jornada
  // entera: se puede sustituir uno solo y que el resto lo siga trayendo LAE.
  const alternarSustituido = (m) =>
    cambiar(m.orden, 'sustituido_de', m.sustituido_de ? null : `${m.local} – ${m.visitante}`)

  async function guardar() {
    setGuardando(true)
    try {
      await guardarPartidos(partidos.map(m => ({ ...m, round_id: roundId })))
      // La etiqueta "Especial" de la jornada refleja si hay al menos un
      // partido sustituido, no si el admin la marcó a mano en algún momento.
      await actualizarJornada(roundId, { es_especial: partidos.some(m => m.sustituido_de) })
      setBorrador(null)
      alGuardar()
    } catch (e) { alFallar(e) } finally { setGuardando(false) }
  }

  return (
    <Seccion
      titulo={`Partidos de la jornada ${datos.round.numero}`}
      entradilla={
        <>
          El signo es lo único que puntúa. LAE no publica los equipos de una jornada hasta que
          se juega, así que hay que copiarlos a mano del boletín oficial —{' '}
          <a href="https://www.loteriasyapuestas.es/es/quiniela" target="_blank" rel="noreferrer"
             style={{ color: 'var(--rojo)', textDecoration: 'underline' }}>
            ábrelo en otra pestaña
          </a>. Los signos y marcadores sí llegan solos en cuanto la jornada acaba. Si cambias
          algún partido por otro tuyo, márcalo como "Sustituido": ese en concreto ya no se
          tocará solo, pero el resto se sigue sincronizando con LAE.
        </>
      }
      accion={<button className="principal" onClick={guardar} disabled={!borrador || guardando}>
        {guardando ? 'Guardando…' : 'Guardar partidos'}
      </button>}
    >
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>Nº</th>
              <th>Local</th>
              <th>Visitante</th>
              <th className="num" style={{ width: 120 }}>Marcador</th>
              <th style={{ width: 130 }}>Signo</th>
              <th style={{ width: 110 }}>Origen</th>
            </tr>
          </thead>
          <tbody>
            {partidos.map(m => (
              <tr key={m.orden} style={m.orden === 15 ? { opacity: .55 } : undefined}>
                <td className="posicion">{String(m.orden).padStart(2, '0')}</td>
                <td><input value={m.local ?? ''} style={{ width: '100%' }}
                           onChange={e => cambiar(m.orden, 'local', e.target.value)} /></td>
                <td><input value={m.visitante ?? ''} style={{ width: '100%' }}
                           onChange={e => cambiar(m.orden, 'visitante', e.target.value)} /></td>
                <td className="num">
                  <input type="number" min="0" value={m.goles_local ?? ''} style={{ width: 46 }}
                         onChange={e => cambiar(m.orden, 'goles_local', e.target.value === '' ? null : +e.target.value)} />
                  <span style={{ margin: '0 5px', color: 'var(--tinta-3)' }}>–</span>
                  <input type="number" min="0" value={m.goles_visitante ?? ''} style={{ width: 46 }}
                         onChange={e => cambiar(m.orden, 'goles_visitante', e.target.value === '' ? null : +e.target.value)} />
                </td>
                <td>
                  {m.orden === 15 ? (
                    <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>No puntúa</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 3 }}>
                      {['1', 'X', '2'].map(s => (
                        <button key={s} type="button"
                                onClick={() => cambiar(m.orden, 'signo', m.signo === s ? null : s)}
                                style={{
                                  padding: '5px 10px',
                                  background: m.signo === s ? 'var(--verde)' : 'transparent',
                                  color: m.signo === s ? '#fff' : 'var(--tinta)',
                                  borderColor: m.signo === s ? 'var(--verde)' : 'var(--regla-fuerte)',
                                }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {m.orden !== 15 && (
                    <button type="button" onClick={() => alternarSustituido(m)}
                            title={m.sustituido_de
                              ? `Sustituye a: ${m.sustituido_de}. LAE no lo tocará; vuelve a pulsar para que vuelva a sincronizarse solo.`
                              : 'Este partido lo trae LAE solo. Púlsalo para cambiarlo por otro tuyo.'}
                            style={{
                              padding: '5px 9px', fontSize: 12,
                              background: m.sustituido_de ? 'var(--oro-suave)' : 'transparent',
                              color: m.sustituido_de ? 'var(--oro)' : 'var(--tinta-3)',
                              borderColor: m.sustituido_de ? 'var(--oro)' : 'var(--regla)',
                            }}>
                      {m.sustituido_de ? '★ Sustituido' : 'Oficial'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  )
}
