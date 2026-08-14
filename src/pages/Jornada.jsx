import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getJornada, suscribirseAJornada } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Dato, Persona, Puesto, TiraSignos, Dinero } from '../components/ui.jsx'
import { euros, fechaHora } from '../lib/formato.js'

export default function Jornada() {
  const { id } = useParams()
  const [refresco, setRefresco] = useState(0)
  const { cargando, error, datos } = useAsync(() => getJornada(id), [id, refresco])

  // Mientras se juega, los cambios de marcador llegan por websocket y la tabla
  // se recoloca sola: nadie tiene que recargar el domingo por la tarde.
  useEffect(() => suscribirseAJornada(id, () => setRefresco(n => n + 1)), [id])

  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Esa jornada no existe.</Vacio>

  const { round, partidos, boletos, resumen } = datos
  const enJuego = round.estado === 'en_juego'
  const signos = partidos.slice(0, 14).map(m => m.signo ?? m.signo_provisional ?? null)
  const publicados = signos.filter(Boolean).length

  // Mientras la jornada no está liquidada no hay premio repartido, pero sí
  // hay dinero en juego. Enseñar 0,00 € haría pensar que no se juega nada,
  // así que se muestra la estimación con las mismas reglas de reparto.
  const liquidada = round.estado === 'finalizada'
  const recaudacion = resumen.recaudacion_cents ?? 0
  const premio = liquidada ? (resumen.premio_cents ?? 0) : Math.floor(recaudacion / 2)
  const alBote = liquidada ? (resumen.al_bote_cents ?? 0) : recaudacion - Math.floor(recaudacion / 2)

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>
            Jornada {round.numero}{' '}
            {enJuego && <span className="insignia viva"><span className="punto-vivo" />EN JUEGO</span>}
            {round.es_especial && <span className="insignia" style={{ marginLeft: 6 }}>★ Especial</span>}
          </h1>
          <p>
            {enJuego
              ? `${publicados} de 14 partidos resueltos · clasificación provisional`
              : `Cerrada el ${fechaHora(round.cierra_at)}`}
          </p>
        </div>
        <Link to="/jornadas" className="boton">← Todas</Link>
      </div>

      <div className="rejilla c4">
        <Dato etiqueta="Boletos" valor={resumen.boletos ?? boletos.length} />
        <Dato etiqueta="Recaudado" valor={euros(recaudacion)} />
        <Dato etiqueta="Premio" valor={euros(premio)}
              nota={liquidada ? '50% al que más acierta' : 'En juego · estimado'} />
        <Dato etiqueta="Al bote" valor={euros(alBote)} color="var(--oro)"
              nota={liquidada ? undefined : 'Estimado'} />
      </div>

      {resumen.bote_pagado_cents > 0 && (
        <div className="aviso" style={{ marginTop: 16 }}>
          <strong>¡Pleno de 14!</strong> Se repartió también el bote entero:{' '}
          {euros(resumen.bote_pagado_cents)}.
        </div>
      )}

      <div className="encabezado-seccion"><h2>Los partidos</h2></div>
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Partido</th>
                <th className="num">Marcador</th>
                <th className="num">Signo</th>
              </tr>
            </thead>
            <tbody>
              {partidos.map(m => (
                <tr key={m.orden} style={m.orden === 15 ? { opacity: .55 } : undefined}>
                  <td style={{ color: 'var(--texto-suave)' }}>{m.orden}</td>
                  <td>
                    {m.local} <span style={{ color: 'var(--texto-suave)' }}>–</span> {m.visitante}
                    {m.orden === 15 && <span className="insignia" style={{ marginLeft: 8 }}>Pleno al 15 · no puntúa</span>}
                    {m.sustituido_de && <span className="insignia aviso" style={{ marginLeft: 8 }}>★ cambiado</span>}
                  </td>
                  <td className="num">
                    {m.goles_local != null ? `${m.goles_local} – ${m.goles_visitante}` : '—'}
                  </td>
                  <td className="num">
                    {m.orden === 15
                      ? '—'
                      : m.signo
                        ? <span className="signo acierto">{m.signo}</span>
                        : m.signo_provisional
                          ? <span className="signo" title="Provisional, aún no oficial">{m.signo_provisional}</span>
                          : <span className="signo vacio">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="encabezado-seccion">
        <div>
          <h2>Las columnas</h2>
          <p>Verde acertado, rojo fallado. Solo se ven una vez cerrado el plazo.</p>
        </div>
      </div>

      {boletos.length === 0 ? (
        <Vacio>Nadie jugó esta jornada.</Vacio>
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Jugador</th>
                  <th className="num">Aciertos</th>
                  <th>Columna</th>
                  <th className="num">Premio</th>
                </tr>
              </thead>
              <tbody>
                {boletos.map((b, i) => (
                  <tr key={b.player_id}>
                    <td><Puesto n={i + 1} /></td>
                    <td>
                      <Link to={`/perfil/${b.player_id}`}><Persona nombre={b.nombre} /></Link>
                    </td>
                    <td className="num">
                      <strong style={{ fontSize: '1.05rem' }}>{b.aciertos}</strong>
                      {b.es_ganador && ' 🏆'}
                    </td>
                    <td><TiraSignos picks={b.picks} signos={signos} /></td>
                    <td className="num">
                      {b.premio_cents ? <Dinero cents={b.premio_cents} conSigno /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
