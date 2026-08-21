import { useState } from 'react'
import { Plus, Trash2, RefreshCw, Download } from 'lucide-react'
import {
  getTemporada, getJornadas, getJornada, crearJornada, actualizarJornada,
  borrarJornada, guardarPartidos, recalcularJornada, sincronizarConLae, procesarDatosLae,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio, Escudo } from '../../components/ui.jsx'
import { euros, fechaCorta } from '../../lib/formato.js'
import { signoDeMarcador } from '../../../scripts/lae.mjs'

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

      <PegarDatosLae alGuardar={refrescar} />
    </>
  )
}

// El fetch hecho desde dentro de nuestra web nunca podría llegar a LAE (esa
// combinación de bloqueos ya se investigó a fondo: Akamai no manda CORS, así
// que ni con la IP correcta el navegador dejaría leer la respuesta). Este
// comando, en cambio, se pega y ejecuta ESTANDO en loteriasyapuestas.es, así
// que para LAE es indistinguible de cualquier visita normal: mismo origen,
// misma IP del admin, sin nada raro que bloquear.
//
// Deliberadamente NO usa copy(): esa función de la consola falla en
// silencio en Firefox (y a veces en Chrome) cuando se llama dentro de un
// .then() en vez de en respuesta directa a la tecla Intro — comprobado.
// En su lugar se imprime el JSON entero y se copia a mano desde la propia
// consola (clic derecho sobre el texto → "Copiar cadena de texto" / "Copy
// string"), que usa el menú nativo del navegador y no falla nunca.
const COMANDO_LAE = `(()=>{const h=new Date().toISOString().slice(0,10).replace(/-/g,''),d=new Date(Date.now()-21*864e5).toISOString().slice(0,10).replace(/-/g,'');Promise.all([fetch('/servicios/buscadorSorteos?game_id=LAQU&celebrados=true&fechaInicioInclusiva='+d+'&fechaFinInclusiva='+h).then(r=>r.json()).catch(()=>[]),fetch('/servicios/proximosv3?game_id=TODOS&num=3').then(r=>r.json()).then(x=>Array.isArray(x)?x.filter(p=>p.game_id==='LAQU'):[]).catch(()=>[])]).then(([celebrados,proximos])=>{const j=JSON.stringify({celebrados:Array.isArray(celebrados)?celebrados:[],proximos});console.log(j)})})();`

/** Camino manual para cuando el botón "Sincronizar con LAE ahora" no llega. */
function PegarDatosLae({ alGuardar }) {
  const [abierto, setAbierto] = useState(false)
  const [json, setJson] = useState('')
  const [estado, setEstado] = useState(null)
  // Si el portapapeles automático falla (permisos del navegador, foco de la
  // pestaña, lo que sea), se enseña el comando en una caja de texto para
  // seleccionarlo y copiarlo a mano con Ctrl+C — eso nunca falla.
  const [mostrarComando, setMostrarComando] = useState(false)

  async function copiarComando() {
    try {
      await navigator.clipboard.writeText(COMANDO_LAE)
      setEstado({ tipo: 'ok', txt: 'Comando copiado. Pégalo en la consola de la pestaña de LAE y pulsa Intro.' })
      setMostrarComando(false)
    } catch {
      setEstado({
        tipo: 'error',
        txt: 'El navegador no ha dejado copiarlo solo. Selecciona el texto de abajo y cópialo con Ctrl+C (o clic derecho → Copiar).',
      })
      setMostrarComando(true)
    }
  }

  async function procesar() {
    setEstado({ tipo: 'trabajando', txt: 'Procesando…' })
    try {
      const datos = JSON.parse(json)
      const resumen = await procesarDatosLae(datos)
      const intersemanales = resumen.filter(r => r.omitida === 'intersemanal').length
      setJson('')
      setEstado({
        tipo: 'ok',
        txt: `Listo: ${resumen.length - intersemanales} jornada(s) procesada(s)` +
             (intersemanales ? `, ${intersemanales} intersemanal(es) ignorada(s).` : '.'),
      })
      alGuardar()
    } catch (e) {
      setEstado({
        tipo: 'error',
        txt: e instanceof SyntaxError ? 'Eso no es un JSON válido. Repite el paso 3 y pega el resultado tal cual.' : e.message,
      })
    }
  }

  return (
    <Seccion
      titulo="Pegar datos de LAE a mano"
      nota={abierto ? undefined : 'Para cuando "Sincronizar con LAE ahora" no consiga llegar'}
      accion={<button onClick={() => setAbierto(a => !a)}>{abierto ? 'Ocultar' : 'Abrir'}</button>}
    >
      {abierto && (
        <div style={{ display: 'grid', gap: 14, padding: '14px 0', maxWidth: 560 }}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--tinta-2)', display: 'grid', gap: 6 }}>
            <li>
              Abre{' '}
              <a href="https://www.loteriasyapuestas.es/es/quiniela" target="_blank" rel="noreferrer"
                 style={{ color: 'var(--rojo)', textDecoration: 'underline' }}>
                loteriasyapuestas.es
              </a>{' '}
              en otra pestaña.
            </li>
            <li>Pulsa F12 (herramientas de desarrollador) y abre la pestaña "Consola".</li>
            <li>Vuelve aquí, pulsa el botón de abajo, y pega lo copiado en esa consola. Intro.</li>
            <li>
              Saldrá un texto largo impreso en la consola. Haz <strong>clic derecho encima</strong> y elige
              "Copiar cadena de texto" (o "Copy string") — no se copia solo, ese paso es a mano.
            </li>
            <li>Vuelve a esta pestaña y pégalo en el cuadro de aquí abajo.</li>
          </ol>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={copiarComando}>Copiar el comando del paso 3</button>
            <button onClick={() => setMostrarComando(m => !m)} style={{ fontSize: 12.5 }}>
              {mostrarComando ? 'Ocultar el comando' : '¿No se copia? Verlo para copiarlo a mano'}
            </button>
          </div>

          {mostrarComando && (
            <textarea readOnly value={COMANDO_LAE} rows={3}
                      onFocus={e => e.target.select()}
                      style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: 8, color: 'var(--tinta-2)' }} />
          )}

          <textarea value={json} onChange={e => setJson(e.target.value)} rows={4}
                    placeholder="Pega aquí el resultado del paso 4"
                    style={{ fontFamily: 'var(--mono)', fontSize: 12, padding: 8 }} />

          <button className="principal" onClick={procesar}
                  disabled={!json.trim() || estado?.tipo === 'trabajando'} style={{ justifySelf: 'start' }}>
            Procesar
          </button>

          {estado && <div className="aviso">{estado.txt}</div>}
        </div>
      )}
    </Seccion>
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
                {/* El escudo aparece en cuanto el nombre se reconoce, así que
                    hace de acuse de recibo mientras se teclea: si sigue
                    saliendo el redondel con las iniciales, ese equipo no va a
                    tener imagen en la quiniela. */}
                <td>
                  <span className="equipo-editable">
                    <Escudo nombre={m.local} laeId={m.lae_id_local} />
                    <input value={m.local ?? ''}
                           onChange={e => cambiar(m.orden, 'local', e.target.value)} />
                  </span>
                </td>
                <td>
                  <span className="equipo-editable">
                    <Escudo nombre={m.visitante} laeId={m.lae_id_visitante} />
                    <input value={m.visitante ?? ''}
                           onChange={e => cambiar(m.orden, 'visitante', e.target.value)} />
                  </span>
                </td>
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
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
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
                      {/* Lo que implica el marcador. No se rellena el signo
                          oficial con esto —ese lo publica LAE y es el que
                          reparte el dinero—, pero sí alimenta la clasificación
                          en vivo, así que conviene verlo. */}
                      {!m.signo && signoDeMarcador(m.goles_local, m.goles_visitante) && (
                        <span className="signo" style={{ marginLeft: 4 }}
                              title="Deducido del marcador: cuenta para la clasificación en vivo, no para el reparto">
                          {signoDeMarcador(m.goles_local, m.goles_visitante)}
                        </span>
                      )}
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
