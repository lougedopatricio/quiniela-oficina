import { useParams, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { getPerfil } from '../lib/api.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { jugadorDemo } from '../lib/demo.js'
import {
  useAsync, Cargando, Vacio, AvisoError,
  Portada, Destacado, CifraMenor, Seccion, Ganador, Dinero,
} from '../components/ui.jsx'
import { euros, fechaCorta, iniciales, decimal } from '../lib/formato.js'
import { titularPerfil } from '../lib/titulares.js'

export default function Perfil() {
  const { id } = useParams()
  const playerId = id ?? (MODO_DEMO ? jugadorDemo.id : null)

  const { cargando, error, datos } = useAsync(
    () => (playerId ? getPerfil(playerId) : Promise.resolve(null)),
    [playerId]
  )

  if (!playerId) return <Vacio>Entra con tu correo para ver tu expediente.</Vacio>
  if (cargando) return <Cargando filas={7} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No se encuentra a esa persona.</Vacio>

  const { jugador, historial, movimientos, saldo_cents } = datos
  const jugadas = historial.filter(h => h.estado === 'finalizada')
  const total = jugadas.reduce((a, h) => a + h.aciertos, 0)
  const media = jugadas.length ? total / jugadas.length : 0
  const mejor = jugadas.length ? Math.max(...jugadas.map(h => h.aciertos)) : 0
  const victorias = jugadas.filter(h => h.es_ganador).length
  const serie = historial.map(h => ({ jornada: `J${h.jornada}`, aciertos: h.aciertos, ganador: h.es_ganador }))

  return (
    <>
      <Portada
        antetitulo={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="inicial" style={{ width: 24, height: 24, borderColor: 'var(--rojo)', color: 'var(--rojo)' }}>
              {iniciales(jugador.nombre)}
            </span>
            Expediente
          </span>
        }
        titular={titularPerfil(jugador, jugadas.length, victorias)}
        entradilla={
          jugadas.length
            ? `${jugadas.length} jornada${jugadas.length === 1 ? '' : 's'} jugada${jugadas.length === 1 ? '' : 's'}, ${total} aciertos y una media de ${decimal(media)} por jornada.`
            : 'Todavía sin jornadas disputadas.'
        }
      >
        <div className="destacado">
          <Destacado rotulo="Saldo" valor={euros(saldo_cents)}
                     tono={saldo_cents < 0 ? 'acento' : undefined}
                     nota={saldo_cents < 0 ? 'Pendiente de pagar' : 'A favor'} />
          <Destacado rotulo="Mejor jornada" valor={mejor} nota="de 14 posibles" />
          <Destacado rotulo="Jornadas ganadas" valor={victorias}
                     nota={victorias ? 'Con premio en el bolsillo' : 'Todavía ninguna'} />
        </div>
      </Portada>

      {serie.length > 0 && (
        <Seccion titulo="Jornada a jornada" nota="La línea de puntos es tu media">
          <div style={{ width: '100%', height: 230, marginTop: 14 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="var(--regla)" vertical={false} />
                <XAxis dataKey="jornada" stroke="var(--tinta-3)" fontSize={11} tickLine={false}
                       axisLine={{ stroke: 'var(--regla-fuerte)' }} />
                <YAxis domain={[0, 14]} stroke="var(--tinta-3)" fontSize={11} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  cursor={{ fill: 'var(--papel-2)' }}
                  formatter={v => [`${v} aciertos`, '']}
                  contentStyle={{
                    background: 'var(--papel)', border: '1px solid var(--regla-fuerte)',
                    borderRadius: 2, color: 'var(--tinta)', fontFamily: 'var(--mono)', fontSize: 12,
                  }}
                />
                <ReferenceLine y={media} stroke="var(--tinta-3)" strokeDasharray="3 3" />
                <Bar dataKey="aciertos">
                  {serie.map((d, i) => <Cell key={i} fill={d.ganador ? 'var(--oro)' : 'var(--tinta-2)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Historial">
        {historial.length === 0 ? (
          <Vacio>Todavía no has jugado ninguna jornada.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Jornada</th>
                  <th className="num">Aciertos</th>
                  <th className="num">Puesto</th>
                  <th className="num">Premio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...historial].reverse().map(h => (
                  <tr key={h.round_id}>
                    <td>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>Jornada {h.jornada}</span>
                      {h.estado === 'en_juego' && (
                        <span className="etiqueta directo" style={{ marginLeft: 8 }}>
                          <span className="punto-vivo" />En juego
                        </span>
                      )}
                    </td>
                    <td className="num destaca">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {h.es_ganador && <Ganador />}{h.aciertos}
                      </span>
                    </td>
                    <td className="num">{h.puesto ? `${h.puesto} de ${h.de}` : '—'}</td>
                    <td className="num">
                      {h.premio_cents ? <Dinero cents={h.premio_cents} conSigno /> : <span style={{ color: 'var(--tinta-3)' }}>—</span>}
                    </td>
                    <td className="num"><Link to={`/jornada/${h.round_id}`} className="boton">Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* La caja va al final y en tono menor: importa, pero no es lo primero
          que uno quiere ver de su propio expediente. */}
      <Seccion titulo="Tu caja" nota="Cuotas, premios y pagos">
        <div className="cifras-menores">
          <CifraMenor rotulo="Aciertos totales" valor={total} />
          <CifraMenor rotulo="Media" valor={decimal(media)} />
          <CifraMenor rotulo="Saldo" valor={euros(saldo_cents)}
                      tono={saldo_cents < 0 ? 'var(--rojo)' : 'var(--verde)'} />
        </div>
        <div className="tabla-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th style={{ width: 90 }}>Fecha</th><th>Concepto</th><th className="num">Importe</th></tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={m.id ?? i}>
                  <td style={{ color: 'var(--tinta-3)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{fechaCorta(m.fecha)}</td>
                  <td>{m.nota}</td>
                  <td className="num"><Dinero cents={m.importe_cents} conSigno /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  )
}
