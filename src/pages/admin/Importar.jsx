import { useState } from 'react'
import { Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getTemporada, getJornadas, getJugadores, importarBoletos } from '../../lib/api.js'
import { leerBoletos, plantillaBoletos } from '../../lib/excel.js'
import { liquidar } from '../../lib/reglas.js'
import { MODO_DEMO } from '../../lib/supabase.js'
import { useAsync, Cargando, AvisoError, Dato } from '../../components/ui.jsx'
import { euros } from '../../lib/formato.js'

export default function Importar() {
  const [roundId, setRoundId] = useState('')
  const [analisis, setAnalisis] = useState(null)
  const [estado, setEstado] = useState(null)

  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [jornadas, jugadores] = await Promise.all([getJornadas(season.id), getJugadores()])
    return { season, jornadas, jugadores }
  }, [])

  if (cargando) return <Cargando filas={4} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <div className="vacio">No hay temporada activa.</div>

  const { season, jornadas, jugadores } = datos
  // Se importa sobre jornadas que aún no están liquidadas.
  const importables = jornadas.filter(j => j.estado !== 'finalizada')

  async function alElegirArchivo(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setEstado(null)
    try {
      setAnalisis(leerBoletos(await f.arrayBuffer(), jugadores))
    } catch (err) {
      setEstado({ tipo: 'error', txt: `No se ha podido leer el archivo: ${err.message}` })
    }
  }

  const validas = analisis?.filas.filter(f => f.valida) ?? []
  const rotas = analisis?.filas.filter(f => !f.valida) ?? []

  // Previsualización del reparto con las mismas reglas que aplicará la base.
  // Los aciertos aún no se conocen (dependen de los signos oficiales), así que
  // solo se anticipa el dinero, que sí depende únicamente del número de boletos.
  const precio = season.precio_columna_cents
  const previo = validas.length ? liquidar(validas.map(() => 0), precio, 0) : null

  async function importar() {
    setEstado({ tipo: 'trabajando', txt: 'Importando…' })
    try {
      const res = await importarBoletos(roundId, validas)
      setEstado({
        tipo: 'ok',
        txt: res?.liquidada
          ? `${validas.length} boletos importados y jornada liquidada: ${res.ganadores} ganador(es) con ${res.max_aciertos} aciertos.`
          : `${validas.length} boletos importados. La jornada se liquidará sola cuando LAE publique los 14 signos.`,
      })
      setAnalisis(null)
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>Importar boletos</h1>
          <p>Primera columna el nombre, y a continuación los 14 signos. Nada se guarda hasta que revises la previsualización.</p>
        </div>
        <button onClick={() => plantillaBoletos(jugadores)}>
          <Download size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          Plantilla
        </button>
      </div>

      {MODO_DEMO && (
        <div className="aviso" style={{ marginBottom: 16 }}>
          <strong>Modo demo.</strong> Puedes probar la lectura y la validación del Excel,
          pero el botón de importar está desactivado porque no hay ninguna base conectada.
        </div>
      )}

      <div className="tarjeta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Jornada{' '}
          <select value={roundId} onChange={e => setRoundId(e.target.value)}>
            <option value="">Elige una…</option>
            {importables.map(j => (
              <option key={j.round_id} value={j.round_id}>
                J{j.numero} · {j.estado}
              </option>
            ))}
          </select>
        </label>

        <label className="boton" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Upload size={15} />
          Elegir Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={alElegirArchivo} style={{ display: 'none' }} />
        </label>

        {analisis && (
          <span className="insignia ok">
            {validas.length} correcto{validas.length === 1 ? '' : 's'}
            {rotas.length > 0 && ` · ${rotas.length} con problemas`}
          </span>
        )}
      </div>

      {estado && (
        <div className="aviso" style={{ marginTop: 16 }}>
          {estado.tipo === 'ok' ? <CheckCircle2 size={15} style={{ verticalAlign: -2 }} />
                                : <AlertTriangle size={15} style={{ verticalAlign: -2 }} />}{' '}
          {estado.txt}
        </div>
      )}

      {analisis && (
        <>
          {previo && (
            <div className="rejilla c4" style={{ marginTop: 18 }}>
              <Dato etiqueta="Boletos válidos" valor={validas.length} />
              <Dato etiqueta="Recaudación" valor={euros(previo.recaudacion)} />
              <Dato etiqueta="Premio" valor={euros(previo.premio)} nota="50%" />
              <Dato etiqueta="Al bote" valor={euros(previo.alBote)} color="var(--oro)" />
            </div>
          )}

          <div className="encabezado-seccion">
            <div>
              <h2>Previsualización</h2>
              <p>Las filas con problemas no se importan. Corrige el Excel y vuelve a subirlo.</p>
            </div>
            <button className="principal"
                    disabled={MODO_DEMO || !roundId || validas.length === 0 || estado?.tipo === 'trabajando'}
                    onClick={importar}>
              Importar {validas.length} boleto{validas.length === 1 ? '' : 's'}
            </button>
          </div>

          <div className="tarjeta" style={{ padding: 0 }}>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Jugador</th>
                    <th>Columna</th>
                    <th>Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.filas.map(f => (
                    <tr key={f.linea}
                        style={f.valida ? undefined : { background: 'color-mix(in srgb, var(--rojo) 9%, transparent)' }}>
                      <td style={{ color: 'var(--texto-suave)' }}>{f.linea}</td>
                      <td>{f.nombre}</td>
                      <td>
                        <div className="tira-signos">
                          {f.picks.map((p, i) => (
                            <span key={i} className={`signo ${p === '-' ? 'fallo' : ''}`}>{p}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ color: f.valida ? 'var(--verde)' : 'var(--rojo)', fontSize: '.84rem' }}>
                        {f.valida ? '✓ correcta' : f.problemas.join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
