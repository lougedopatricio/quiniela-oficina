import { useParams, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { getPerfil } from '../lib/api.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { jugadorDemo } from '../lib/demo.js'
import { useAsync, Cargando, Vacio, AvisoError, Dato, Dinero } from '../components/ui.jsx'
import { euros, fechaCorta, iniciales } from '../lib/formato.js'

export default function Perfil() {
  const { id } = useParams()
  const playerId = id ?? (MODO_DEMO ? jugadorDemo.id : null)

  const { cargando, error, datos } = useAsync(
    () => (playerId ? getPerfil(playerId) : Promise.resolve(null)),
    [playerId]
  )

  if (!playerId) return <Vacio>Entra con tu email para ver tu historial.</Vacio>
  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No se encuentra a esa persona.</Vacio>

  const { jugador, historial, movimientos, saldo_cents } = datos
  const jugadas = historial.filter(h => h.estado === 'finalizada')
  const total = jugadas.reduce((a, h) => a + h.aciertos, 0)
  const media = jugadas.length ? total / jugadas.length : 0
  const mejor = jugadas.length ? Math.max(...jugadas.map(h => h.aciertos)) : 0
  const victorias = jugadas.filter(h => h.es_ganador).length

  const serie = historial.map(h => ({
    jornada: `J${h.jornada}`, aciertos: h.aciertos, ganador: h.es_ganador,
  }))

  return (
    <>
      <div className="encabezado-seccion">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="avatar" style={{ width: 52, height: 52, fontSize: '1.1rem' }}>
            {iniciales(jugador.nombre)}
          </div>
          <div>
            <h1>{jugador.nombre}</h1>
            <p>{jugadas.length} jornada{jugadas.length === 1 ? '' : 's'} jugada{jugadas.length === 1 ? '' : 's'}
               {victorias > 0 && ` · 🏆 ${victorias} victoria${victorias === 1 ? '' : 's'}`}</p>
          </div>
        </div>
      </div>

      <div className="rejilla c4">
        <Dato etiqueta="Aciertos" valor={total} nota="En toda la temporada" />
        <Dato etiqueta="Media" valor={media.toFixed(2)} nota="Por jornada" />
        <Dato etiqueta="Mejor jornada" valor={mejor} nota="de 14" />
        <Dato etiqueta="Saldo" valor={euros(saldo_cents)}
              color={saldo_cents < 0 ? 'var(--rojo)' : 'var(--verde)'}
              nota={saldo_cents < 0 ? 'Pendiente de pagar' : 'A tu favor'} />
      </div>

      {serie.length > 0 && (
        <>
          <div className="encabezado-seccion">
            <div>
              <h2>Aciertos jornada a jornada</h2>
              <p>Las barras doradas son las jornadas que ganaste. La línea es tu media.</p>
            </div>
          </div>
          <div className="tarjeta">
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={serie} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="var(--borde)" vertical={false} />
                  <XAxis dataKey="jornada" stroke="var(--texto-suave)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 14]} stroke="var(--texto-suave)" fontSize={12} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: 'var(--superficie-2)' }}
                    formatter={v => [`${v} aciertos`, '']}
                    contentStyle={{
                      background: 'var(--superficie)', border: '1px solid var(--borde)',
                      borderRadius: 10, color: 'var(--texto)',
                    }}
                  />
                  <ReferenceLine y={media} stroke="var(--texto-suave)" strokeDasharray="4 4" />
                  <Bar dataKey="aciertos" radius={[6, 6, 0, 0]}>
                    {serie.map((d, i) => (
                      <Cell key={i} fill={d.ganador ? 'var(--oro)' : 'var(--acento)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div className="encabezado-seccion"><h2>Historial</h2></div>
      {historial.length === 0 ? (
        <Vacio>Todavía no has jugado ninguna jornada.</Vacio>
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Jornada</th>
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
                      <strong>J{h.jornada}</strong>
                      {h.estado === 'en_juego' && (
                        <span className="insignia viva" style={{ marginLeft: 8 }}>
                          <span className="punto-vivo" />en juego
                        </span>
                      )}
                    </td>
                    <td className="num"><strong>{h.aciertos}</strong>{h.es_ganador && ' 🏆'}</td>
                    <td className="num">{h.puesto ? `${h.puesto}º de ${h.de}` : '—'}</td>
                    <td className="num">{h.premio_cents ? <Dinero cents={h.premio_cents} conSigno /> : '—'}</td>
                    <td className="num"><Link to={`/jornada/${h.round_id}`} className="boton">Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="encabezado-seccion">
        <div>
          <h2>Movimientos</h2>
          <p>Todo lo que has pagado y cobrado. Si algo no cuadra, aquí está el porqué.</p>
        </div>
      </div>
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Concepto</th><th className="num">Importe</th></tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={m.id ?? i}>
                  <td style={{ color: 'var(--texto-suave)' }}>{fechaCorta(m.fecha)}</td>
                  <td>{m.nota}</td>
                  <td className="num"><Dinero cents={m.importe_cents} conSigno /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
