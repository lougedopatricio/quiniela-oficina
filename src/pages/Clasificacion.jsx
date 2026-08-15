import { Link } from 'react-router-dom'
import { getTemporada, getClasificacion, getBote, getJornadas } from '../lib/api.js'
import {
  useAsync, Cargando, Vacio, AvisoError,
  Portada, Destacado, CifraMenor, Seccion, Persona, Posicion, Ganador,
} from '../components/ui.jsx'
import { euros, decimal } from '../lib/formato.js'
import { titularClasificacion } from '../lib/titulares.js'

export default function Clasificacion() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [tabla, bote, jornadas] = await Promise.all([
      getClasificacion(season.id), getBote(season.id), getJornadas(season.id),
    ])
    return { season, tabla, bote, jornadas }
  }, [])

  if (cargando) return <Cargando filas={7} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Todavía no hay ninguna temporada abierta.</Vacio>

  const { season, tabla, bote, jornadas } = datos
  const enJuego = jornadas.find(j => j.estado === 'en_juego')
  const finalizadas = jornadas.filter(j => j.estado === 'finalizada')
  const lider = tabla[0]

  const totalRepartido = finalizadas.reduce((a, j) => a + (j.premio_cents ?? 0), 0)

  return (
    <>
      <Portada
        antetitulo={
          enJuego
            ? <>{season.nombre}<span className="etiqueta directo" style={{ marginLeft: 4 }}>
                <span className="punto-vivo" />Jornada {enJuego.numero} en juego</span></>
            : season.nombre
        }
        titular={titularClasificacion(tabla, finalizadas.length)}
        entradilla={`${finalizadas.length} jornada${finalizadas.length === 1 ? '' : 's'} disputada${finalizadas.length === 1 ? '' : 's'} a ${euros(season.precio_columna_cents)} la columna.`}
      >
        {/* Lo que la gente viene a mirar, en grande. El resto baja de rango. */}
        <div className="destacado">
          <Destacado rotulo="El bote" valor={euros(bote.actual_cents)} tono="oro" />
          <Destacado
            rotulo="Líder de la general"
            valor={lider?.nombre ?? '—'}
            nota={lider ? `${lider.aciertos_total} aciertos · ${decimal(lider.media_aciertos)} de media` : 'Sin datos'}
          />
          <Destacado
            rotulo="Repartido hasta hoy"
            valor={euros(totalRepartido)}
            nota={`Entre ${tabla.length} participantes`}
          />
        </div>
      </Portada>

      {enJuego && (
        <Seccion
          titulo={`La jornada ${enJuego.numero} se está jugando`}
          accion={<Link to={`/jornada/${enJuego.round_id}`} className="boton">Ver el directo</Link>}
        />
      )}

      <Seccion
        titulo="Clasificación general"
        nota="Solo jornadas finalizadas"
      >
        {tabla.length === 0 ? (
          <Vacio>Aún no se ha disputado ninguna jornada.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>Participante</th>
                  <th className="num">Aciertos</th>
                  <th className="num">Media</th>
                  <th className="num">Mejor</th>
                  <th className="num">Jornadas ganadas</th>
                  <th className="num">Jugadas</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((f, i) => (
                  <tr key={f.player_id} className={i < 3 ? 'podio' : undefined}>
                    <td><Posicion n={i + 1} /></td>
                    <td>
                      <Link to={`/perfil/${f.player_id}`}><Persona nombre={f.nombre} /></Link>
                    </td>
                    <td className="num destaca">{f.aciertos_total}</td>
                    <td className="num">{decimal(f.media_aciertos)}</td>
                    <td className="num">{f.mejor_jornada}</td>
                    <td className="num">
                      {f.victorias > 0
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Ganador />{f.victorias}
                          </span>
                        : <span style={{ color: 'var(--tinta-3)' }}>—</span>}
                    </td>
                    <td className="num">{f.jornadas_jugadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {finalizadas.length > 0 && (
        <Seccion titulo="La temporada en cifras">
          <div className="cifras-menores">
            <CifraMenor rotulo="Jornadas" valor={finalizadas.length} />
            <CifraMenor rotulo="Participantes" valor={tabla.length} />
            <CifraMenor rotulo="Boletos jugados"
                        valor={finalizadas.reduce((a, j) => a + (j.boletos ?? 0), 0)} />
            <CifraMenor rotulo="Recaudado"
                        valor={euros(finalizadas.reduce((a, j) => a + (j.recaudacion_cents ?? 0), 0))} />
            <CifraMenor rotulo="Mejor marca"
                        valor={Math.max(0, ...tabla.map(f => f.mejor_jornada))}
                        tono="var(--rojo)" />
          </div>
        </Seccion>
      )}
    </>
  )
}
