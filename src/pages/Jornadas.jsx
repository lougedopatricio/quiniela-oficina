import { Link } from 'react-router-dom'
import { getTemporada, getJornadas } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Portada, Seccion, Dinero } from '../components/ui.jsx'
import { fechaCorta, euros } from '../lib/formato.js'

const ESTADO = {
  finalizada: { clase: 'ok',      txt: 'Finalizada' },
  en_juego:   { clase: 'directo', txt: 'En directo' },
  abierta:    { clase: 'oro',     txt: 'Abierta' },
  cerrada:    { clase: '',        txt: 'Cerrada' },
  borrador:   { clase: '',        txt: 'Borrador' },
}

export default function Jornadas() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    return season ? { season, jornadas: await getJornadas(season.id) } : null
  }, [])

  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos?.jornadas.length) return <Vacio>Todavía no hay jornadas.</Vacio>

  const { season, jornadas } = datos
  const finalizadas = jornadas.filter(j => j.estado === 'finalizada')
  const recaudado = finalizadas.reduce((a, j) => a + (j.recaudacion_cents ?? 0), 0)

  return (
    <>
      <Portada
        antetitulo={season.nombre}
        titular="Todas las jornadas, una por una"
        entradilla={`${finalizadas.length} disputadas y ${euros(recaudado)} recaudados en total.`}
      />

      <Seccion titulo="El histórico" nota="De la más reciente a la primera">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Jornada</th>
                <th>Estado</th>
                <th className="num">Boletos</th>
                <th className="num">Recaudado</th>
                <th className="num">Premio</th>
                <th className="num">Al bote</th>
                <th className="num">Mejor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map(j => {
                const e = ESTADO[j.estado] ?? ESTADO.borrador
                return (
                  <tr key={j.round_id}>
                    <td>
                      <Link to={`/jornada/${j.round_id}`}>
                        <span style={{ fontFamily: 'var(--serif)', fontSize: 21 }}>Jornada {j.numero}</span>
                      </Link>
                      <div style={{ color: 'var(--tinta-3)', fontSize: 12 }}>{fechaCorta(j.cierra_at)}</div>
                    </td>
                    <td>
                      <span className={`etiqueta ${e.clase}`}>
                        {j.estado === 'en_juego' && <span className="punto-vivo" />}
                        {e.txt}
                      </span>
                      {j.es_especial && <span className="etiqueta oro" style={{ marginLeft: 6 }}>Especial</span>}
                    </td>
                    <td className="num">{j.boletos}</td>
                    <td className="num"><Dinero cents={j.recaudacion_cents} /></td>
                    <td className="num"><Dinero cents={j.premio_cents} /></td>
                    <td className="num"><Dinero cents={j.al_bote_cents} /></td>
                    <td className="num destaca">{j.mejor_puntuacion ?? '—'}</td>
                    <td className="num">
                      <Link to={`/jornada/${j.round_id}`} className="boton">Abrir</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  )
}
