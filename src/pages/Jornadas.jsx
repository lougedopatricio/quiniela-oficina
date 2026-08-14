import { Link } from 'react-router-dom'
import { getTemporada, getJornadas } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Dinero } from '../components/ui.jsx'
import { fechaCorta } from '../lib/formato.js'

const INSIGNIA = {
  finalizada: { clase: 'ok',    txt: 'Finalizada' },
  en_juego:   { clase: 'viva',  txt: 'En juego' },
  abierta:    { clase: 'aviso', txt: 'Abierta' },
  cerrada:    { clase: '',      txt: 'Cerrada' },
  borrador:   { clase: '',      txt: 'Borrador' },
}

export default function Jornadas() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    return season ? { season, jornadas: await getJornadas(season.id) } : null
  }, [])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />
  if (!datos?.jornadas.length) return <Vacio>Todavía no hay jornadas.</Vacio>

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>Jornadas</h1>
          <p>Cada jornada reparte la mitad de lo recaudado y manda la otra mitad al bote.</p>
        </div>
      </div>

      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Jornada</th>
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
              {datos.jornadas.map(j => {
                const ins = INSIGNIA[j.estado] ?? INSIGNIA.borrador
                return (
                  <tr key={j.round_id}>
                    <td>
                      <strong>J{j.numero}</strong>
                      {j.es_especial && <span className="insignia" style={{ marginLeft: 8 }}>★ Especial</span>}
                      <div style={{ color: 'var(--texto-suave)', fontSize: '.78rem' }}>
                        {fechaCorta(j.cierra_at)}
                      </div>
                    </td>
                    <td>
                      <span className={`insignia ${ins.clase}`}>
                        {j.estado === 'en_juego' && <span className="punto-vivo" />}
                        {ins.txt}
                      </span>
                    </td>
                    <td className="num">{j.boletos}</td>
                    <td className="num"><Dinero cents={j.recaudacion_cents} /></td>
                    <td className="num"><Dinero cents={j.premio_cents} /></td>
                    <td className="num"><Dinero cents={j.al_bote_cents} /></td>
                    <td className="num"><strong>{j.mejor_puntuacion ?? '—'}</strong></td>
                    <td className="num">
                      <Link to={`/jornada/${j.round_id}`} className="boton">Ver</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
