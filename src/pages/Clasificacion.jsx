import { Link } from 'react-router-dom'
import { getTemporada, getClasificacion, getBote, getJornadas } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Dato, Persona, Puesto } from '../components/ui.jsx'
import { euros } from '../lib/formato.js'

export default function Clasificacion() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [tabla, bote, jornadas] = await Promise.all([
      getClasificacion(season.id), getBote(season.id), getJornadas(season.id),
    ])
    return { season, tabla, bote, jornadas }
  }, [])

  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Todavía no hay ninguna temporada activa.</Vacio>

  const { season, tabla, bote, jornadas } = datos
  const enJuego = jornadas.find(j => j.estado === 'en_juego')
  const finalizadas = jornadas.filter(j => j.estado === 'finalizada')
  const lider = tabla[0]

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>{season.nombre}</h1>
          <p>{finalizadas.length} jornada{finalizadas.length === 1 ? '' : 's'} disputada
             {finalizadas.length === 1 ? '' : 's'} · {euros(season.precio_columna_cents)} la columna</p>
        </div>
      </div>

      <div className="rejilla c4">
        <Dato etiqueta="Bote actual" valor={euros(bote.actual_cents)}
              nota="Se lo lleva quien haga 14" color="var(--oro)" />
        <Dato etiqueta="Líder" valor={lider?.nombre ?? '—'}
              nota={lider ? `${lider.aciertos_total} aciertos` : 'Sin datos'} />
        <Dato etiqueta="Jornadas" valor={finalizadas.length}
              nota={enJuego ? `La ${enJuego.numero} en juego` : 'Ninguna en curso'} />
        <Dato etiqueta="Participantes" valor={tabla.length} nota="En la oficina" />
      </div>

      {enJuego && (
        <div className="encabezado-seccion">
          <div>
            <h2>
              Jornada {enJuego.numero}{' '}
              <span className="insignia viva"><span className="punto-vivo" />EN JUEGO</span>
            </h2>
            <p>La clasificación provisional se actualiza sola conforme acaban los partidos.</p>
          </div>
          <Link to={`/jornada/${enJuego.round_id}`} className="boton">Ver en directo</Link>
        </div>
      )}

      <div className="encabezado-seccion">
        <div>
          <h2>Clasificación general</h2>
          <p>Solo cuentan las jornadas finalizadas. Empate a aciertos: manda quien más jornadas ha ganado.</p>
        </div>
      </div>

      {tabla.length === 0 ? (
        <Vacio>Aún no se ha disputado ninguna jornada.</Vacio>
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Jugador</th>
                  <th className="num">Aciertos</th>
                  <th className="num">Media</th>
                  <th className="num">Mejor</th>
                  <th className="num">Victorias</th>
                  <th className="num">Jugadas</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((f, i) => (
                  <tr key={f.player_id}>
                    <td><Puesto n={i + 1} /></td>
                    <td>
                      <Link to={`/perfil/${f.player_id}`}><Persona nombre={f.nombre} /></Link>
                    </td>
                    <td className="num"><strong>{f.aciertos_total}</strong></td>
                    <td className="num">{f.media_aciertos}</td>
                    <td className="num">{f.mejor_jornada}</td>
                    <td className="num">{f.victorias > 0 ? `🏆 ${f.victorias}` : '—'}</td>
                    <td className="num">{f.jornadas_jugadas}</td>
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
