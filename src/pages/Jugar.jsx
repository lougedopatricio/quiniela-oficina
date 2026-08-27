import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getJornadaJugable, jugarMiBoleto } from '../lib/api.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { useSesion } from '../lib/sesion.js'
import { jugadorDemo } from '../lib/demo.js'
import {
  useAsync, Cargando, Vacio, AvisoError, Portada, Seccion, Equipo,
} from '../components/ui.jsx'
import { euros, cuentaAtras, fechaHora } from '../lib/formato.js'

// ---------------------------------------------------------------------------
// Rellenar la propia columna.
//
// Guardar cobra la cuota en el acto (lo hace la base, en 0015), así que eso se
// dice ANTES de pulsar y no después: apuntar una deuda sin avisar es la clase
// de sorpresa que hace que la gente deje de fiarse de la caja.
// ---------------------------------------------------------------------------

const SIGNOS = ['1', 'X', '2']
const GOLES = ['0', '1', '2', 'M']

export default function Jugar() {
  const sesion = useSesion()
  const playerId = MODO_DEMO ? jugadorDemo.id : sesion.jugador?.id ?? null

  const [recarga, setRecarga] = useState(0)
  const [borrador, setBorrador] = useState(null)
  const [estado, setEstado] = useState(null)

  const { cargando, error, datos } = useAsync(
    () => (playerId ? getJornadaJugable(playerId) : Promise.resolve(null)),
    [playerId, recarga]
  )

  if (sesion.cargando) return <Cargando filas={6} />
  if (!playerId) {
    return (
      <Vacio>
        <Link to="/entrar" style={{ color: 'var(--rojo)' }}>Entra con tu correo</Link> para
        jugar tu columna.
      </Vacio>
    )
  }
  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Ahora mismo no hay ninguna jornada abierta para jugar.</Vacio>

  const { round, partidos, boleto } = datos
  const puntuables = partidos.filter(m => m.modo_puntuacion !== 'no_puntua')
  const pleno = partidos.find(m => m.modo_puntuacion === 'pleno' && m.exige_resultado)

  // Lo guardado manda hasta que se toca algo; a partir de ahí, el borrador.
  const guardada = {
    picks: boleto?.picks ?? Array(partidos.length).fill('-'),
    pleno_local: boleto?.pleno_local ?? '',
    pleno_visitante: boleto?.pleno_visitante ?? '',
  }
  const columna = borrador ?? guardada

  // Siempre sobre el estado anterior, nunca sobre la copia de este render:
  // rellenar una columna son quince clics seguidos, y construyendo cada uno a
  // partir de `columna` los que caen antes de que React repinte se pisan entre
  // sí y se pierden.
  const editar = (cambio) => setBorrador(prev => {
    const c = prev ?? guardada
    return { ...c, ...cambio(c) }
  })

  const marcar = (orden, s) => editar(c => ({
    picks: c.picks.map((p, i) => (i === orden - 1 ? (p === s ? '-' : s) : p)),
  }))

  // Solo se exige signo a los que puntúan por signo: el pleno con resultado
  // exigido se rellena con los goles de abajo.
  const faltan = puntuables.filter(
    m => m !== pleno && (columna.picks[m.orden - 1] ?? '-') === '-'
  ).length
  const faltaPleno = pleno && !(columna.pleno_local && columna.pleno_visitante)
  const completo = faltan === 0 && !faltaPleno
  const plazo = cuentaAtras(round.cierra_at)
  const cerrado = plazo === 'cerrado'

  async function guardar() {
    setEstado({ tipo: 'trabajando', txt: 'Guardando…' })
    try {
      await jugarMiBoleto({
        round_id: round.id,
        player_id: playerId,
        picks: columna.picks,
        pleno_local: columna.pleno_local,
        pleno_visitante: columna.pleno_visitante,
      })
      setBorrador(null)
      setEstado({ tipo: 'ok', txt: boleto ? 'Columna actualizada.' : 'Columna jugada y cuota apuntada.' })
      setRecarga(n => n + 1)
    } catch (e) { setEstado({ tipo: 'error', txt: e.message }) }
  }

  return (
    <>
      <Portada
        antetitulo={`Jornada ${round.numero}`}
        titular={boleto ? 'Tu columna está echada' : 'Echa tu columna'}
        entradilla={
          cerrado
            ? `El plazo se cerró el ${fechaHora(round.cierra_at)}. Ya no se puede tocar.`
            : `Quedan ${plazo} para el cierre. La columna cuesta ${euros(round.precio_cents)} y ` +
              'se apunta a tu cuenta en cuanto la guardas.'
        }
      />

      {estado && <div className="aviso" style={{ marginTop: 20 }}>{estado.txt}</div>}

      <Seccion
        titulo="Los partidos"
        nota={completo ? 'Completa' : `Faltan ${faltan + (faltaPleno ? 1 : 0)}`}
        accion={
          <button className="principal" onClick={guardar}
                  disabled={!completo || cerrado || estado?.tipo === 'trabajando'}
                  title={!completo ? 'Rellena la columna entera antes de guardar' : undefined}>
            {boleto ? 'Guardar cambios' : `Jugar por ${euros(round.precio_cents)}`}
          </button>
        }
      >
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>Nº</th>
                <th>Encuentro</th>
                <th style={{ width: 130 }}>Tu signo</th>
              </tr>
            </thead>
            <tbody>
              {partidos.map(m => {
                const noPuntua = m.modo_puntuacion === 'no_puntua'
                const esPleno = m === pleno
                return (
                  <tr key={m.orden} style={noPuntua ? { opacity: .45 } : undefined}>
                    <td className="posicion">{String(m.orden).padStart(2, '0')}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Equipo nombre={m.local} laeId={m.lae_id_local} />
                        <span style={{ color: 'var(--tinta-3)' }}>–</span>
                        <Equipo nombre={m.visitante} laeId={m.lae_id_visitante} alinear="derecha" />
                      </span>
                      {esPleno && <span className="etiqueta oro" style={{ marginLeft: 10 }}>Pleno</span>}
                      {noPuntua && <span className="etiqueta" style={{ marginLeft: 10 }}>No puntúa</span>}
                    </td>
                    <td>
                      {noPuntua ? <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>—</span>
                        : esPleno ? <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>Abajo</span>
                        : (
                          <div style={{ display: 'flex', gap: 3 }}>
                            {SIGNOS.map(s => (
                              <button key={s} type="button" disabled={cerrado}
                                      onClick={() => marcar(m.orden, s)}
                                      style={{
                                        padding: '5px 11px',
                                        background: columna.picks[m.orden - 1] === s ? 'var(--tinta)' : 'transparent',
                                        color: columna.picks[m.orden - 1] === s ? 'var(--papel)' : 'var(--tinta-3)',
                                        borderColor: columna.picks[m.orden - 1] === s ? 'var(--tinta)' : 'var(--regla)',
                                      }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Seccion>

      {pleno && (
        <Seccion titulo="El Pleno al 15"
                 entradilla={`${pleno.local} – ${pleno.visitante}. Hay que clavar los goles de cada uno: ` +
                             '"M" vale por tres o más. Es lo que abre el bote.'}>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', padding: '14px 0' }}>
            {[['pleno_local', pleno.local], ['pleno_visitante', pleno.visitante]].map(([campo, nombre]) => (
              <div key={campo} style={{ display: 'grid', gap: 6 }}>
                <span className="rotulo">{nombre}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {GOLES.map(g => (
                    <button key={g} type="button" disabled={cerrado}
                            onClick={() => editar(c => ({ [campo]: c[campo] === g ? '' : g }))}
                            style={{
                              padding: '6px 12px',
                              background: columna[campo] === g ? 'var(--oro)' : 'transparent',
                              color: columna[campo] === g ? '#fff' : 'var(--tinta-3)',
                              borderColor: columna[campo] === g ? 'var(--oro)' : 'var(--regla)',
                            }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </>
  )
}
