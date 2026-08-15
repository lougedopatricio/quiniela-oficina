import { useState } from 'react'
import { Upload, Download, Check, AlertTriangle } from 'lucide-react'
import { getTemporada, getJornadas, getJugadores, importarBoletos } from '../../lib/api.js'
import { leerBoletos, plantillaBoletos } from '../../lib/excel.js'
import { liquidar } from '../../lib/reglas.js'
import { MODO_DEMO } from '../../lib/supabase.js'
import { useAsync, Cargando, AvisoError, Portada, CifraMenor, Seccion, Vacio } from '../../components/ui.jsx'
import { euros } from '../../lib/formato.js'

export default function Importar() {
  const [roundId, setRoundId] = useState('')
  const [analisis, setAnalisis] = useState(null)
  const [estado, setEstado] = useState(null)
  // Activado por defecto: lo normal es que quien entrega el boleto ya haya
  // pagado en mano en el momento de recogerlo.
  const [marcarPagado, setMarcarPagado] = useState(true)

  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [jornadas, jugadores] = await Promise.all([getJornadas(season.id), getJugadores()])
    return { season, jornadas, jugadores }
  }, [])

  if (cargando) return <Cargando filas={4} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { season, jornadas, jugadores } = datos
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

  // Previsualización del dinero con las mismas reglas que aplicará la base.
  // Los aciertos aún no se conocen, pero el reparto solo depende del número
  // de boletos, así que sí se puede anticipar.
  const precio = season.precio_columna_cents
  const previo = validas.length ? liquidar(validas.map(() => 0), precio, 0) : null

  async function importar() {
    setEstado({ tipo: 'trabajando', txt: 'Importando…' })
    try {
      const res = await importarBoletos(roundId, validas, { marcarPagado })
      const conPago = marcarPagado ? ` y ${validas.length} pago${validas.length === 1 ? '' : 's'} anotado${validas.length === 1 ? '' : 's'}` : ''
      setEstado({
        tipo: 'ok',
        txt: res?.liquidada
          ? `${validas.length} boletos importados${conPago}. Jornada liquidada: ${res.ganadores} ganador(es) con ${res.max_aciertos} aciertos.`
          : `${validas.length} boletos importados${conPago}. La jornada se liquidará sola cuando Loterías publique los catorce signos.`,
      })
      setAnalisis(null)
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Subir los boletos de la jornada"
        entradilla="Primera columna el nombre y a continuación los catorce signos. No se guarda nada hasta que revises la previsualización: las filas con problemas se quedan fuera."
      />

      {MODO_DEMO && (
        <div className="aviso" style={{ marginTop: 22 }}>
          <strong>Edición de muestra.</strong> Puedes probar la lectura y la validación del Excel,
          pero importar está desactivado porque no hay ninguna base conectada.
        </div>
      )}

      <Seccion
        titulo="El archivo"
        accion={
          <button onClick={() => plantillaBoletos(jugadores)}>
            <Download size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Plantilla
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '16px 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="rotulo">Jornada</span>
            <select value={roundId} onChange={e => setRoundId(e.target.value)}>
              <option value="">Elige una…</option>
              {importables.map(j => (
                <option key={j.round_id} value={j.round_id}>Jornada {j.numero} · {j.estado}</option>
              ))}
            </select>
          </label>

          <label className="boton" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Upload size={14} />
            Elegir Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={alElegirArchivo} style={{ display: 'none' }} />
          </label>

          {analisis && (
            <span className={`etiqueta ${rotas.length ? 'oro' : 'ok'}`}>
              {validas.length} correcta{validas.length === 1 ? '' : 's'}
              {rotas.length > 0 && ` · ${rotas.length} con problemas`}
            </span>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, paddingBottom: 4 }}>
          <input type="checkbox" checked={marcarPagado} onChange={e => setMarcarPagado(e.target.checked)}
                 style={{ width: 16, height: 16 }} />
          Marcar a todos como pagados en mano al importar
        </label>

        {estado && (
          <div className="aviso">
            {estado.tipo === 'ok'
              ? <Check size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
              : <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
            {estado.txt}
          </div>
        )}
      </Seccion>

      {analisis && (
        <>
          {previo && (
            <Seccion titulo="Lo que va a pasar con el dinero">
              <div className="cifras-menores">
                <CifraMenor rotulo="Boletos válidos" valor={validas.length} />
                <CifraMenor rotulo="Recaudación" valor={euros(previo.recaudacion)} />
                <CifraMenor rotulo="Premio" valor={euros(previo.premio)} tono="var(--rojo)" />
                <CifraMenor rotulo="Al bote" valor={euros(previo.alBote)} tono="var(--oro)" />
              </div>
            </Seccion>
          )}

          <Seccion
            titulo="Previsualización"
            accion={
              <button className="principal"
                      disabled={MODO_DEMO || !roundId || validas.length === 0 || estado?.tipo === 'trabajando'}
                      onClick={importar}>
                Importar {validas.length} boleto{validas.length === 1 ? '' : 's'}
              </button>
            }
            entradilla="Corrige el Excel y vuelve a subirlo si algo no cuadra. Reimportar sustituye las columnas, no las duplica."
          >
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Fila</th>
                    <th>Nombre</th>
                    <th>Columna</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.filas.map(f => (
                    <tr key={f.linea}>
                      <td className="posicion">{String(f.linea).padStart(2, '0')}</td>
                      <td style={{ fontWeight: 500 }}>{f.nombre}</td>
                      <td>
                        <div className="tira-signos">
                          {f.picks.map((p, i) => (
                            <span key={i} className={`signo ${p === '-' ? 'fallo' : ''}`}>{p}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ color: f.valida ? 'var(--verde)' : 'var(--rojo)', fontSize: 13 }}>
                        {f.valida ? 'Correcta' : f.problemas.join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        </>
      )}
    </>
  )
}
