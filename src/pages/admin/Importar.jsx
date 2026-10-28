import { useState } from 'react'
import { Upload, Download, Check, AlertTriangle, UserPlus } from 'lucide-react'
import { getTemporada, getJornadas, getParticipantes, importarBoletos, altaDesdeExcel } from '../../lib/api.js'
import { leerBoletos, plantillaBoletos } from '../../lib/excel.js'
import { liquidar, puntuar } from '../../lib/reglas.js'
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
  // El Excel de la oficina trae también los partidos y los resultados.
  const [conPartidos, setConPartidos] = useState(true)
  const [archivo, setArchivo] = useState(null)
  const [dominio, setDominio] = useState('')
  const [recarga, setRecarga] = useState(0)

  // Participantes y no jugadores a secas: hace falta el correo, porque el
  // Excel de la oficina identifica a cada uno por su usuario de correo.
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [jornadas, jugadores] = await Promise.all([getJornadas(season.id), getParticipantes()])
    return { season, jornadas, jugadores }
  }, [recarga])

  if (cargando && !datos) return <Cargando filas={4} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { season, jornadas, jugadores } = datos
  const importables = jornadas.filter(j => j.estado !== 'finalizada')

  async function alElegirArchivo(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setEstado(null)
    try {
      const buffer = await f.arrayBuffer()
      setArchivo(buffer)
      setAnalisis(leerBoletos(buffer, jugadores))
    } catch (err) {
      setEstado({ tipo: 'error', txt: `No se ha podido leer el archivo: ${err.message}` })
    }
  }

  const validas = analisis?.filas.filter(f => f.valida) ?? []
  const rotas = analisis?.filas.filter(f => !f.valida) ?? []
  const oficina = analisis?.formato === 'oficina'
  // Quien solo falla por no estar dado de alta: se puede arreglar desde aquí.
  const sinAlta = (analisis?.filas ?? []).filter(f => !f.jugador)
  const resultados = oficina ? analisis.partidos.map(p => p.resultado) : null
  const conResultados = resultados?.some(Boolean)

  async function darDeAlta() {
    setEstado({ tipo: 'trabajando', txt: 'Dando de alta…' })
    try {
      await altaDesdeExcel(sinAlta.map(f => f.nombre), dominio)
      const lista = await getParticipantes()
      setAnalisis(leerBoletos(archivo, lista))
      setRecarga(n => n + 1)
      setEstado({ tipo: 'ok', txt: `${sinAlta.length} participante${sinAlta.length === 1 ? '' : 's'} dado${sinAlta.length === 1 ? '' : 's'} de alta. Ponles un apodo en Participantes para que no salgan con el usuario del correo.` })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  // Previsualización del dinero con las mismas reglas que aplicará la base.
  // Los aciertos aún no se conocen, pero el reparto solo depende del número
  // de boletos, así que sí se puede anticipar.
  const precio = season.precio_columna_cents
  const previo = validas.length ? liquidar(validas.map(() => 0), precio, 0) : null

  async function importar() {
    setEstado({ tipo: 'trabajando', txt: 'Importando…' })
    try {
      const res = await importarBoletos(roundId, validas, {
        marcarPagado,
        partidos: oficina && conPartidos ? analisis.partidos : null,
      })
      const conPago = marcarPagado ? ` y ${validas.length} pago${validas.length === 1 ? '' : 's'} anotado${validas.length === 1 ? '' : 's'}` : ''
      const v = res?.volcado
      const conPartidosTxt = v && (v.creados || v.conResultado)
        ? ` Del Excel: ${v.creados} partido${v.creados === 1 ? '' : 's'} nuevo${v.creados === 1 ? '' : 's'} y ${v.conResultado} resultado${v.conResultado === 1 ? '' : 's'}.`
        : ''
      setEstado({
        tipo: 'ok',
        txt: (res?.liquidada
          ? `${validas.length} boletos importados${conPago}. Jornada liquidada: ${res.ganadores} ganador(es) con ${res.max_aciertos} aciertos.`
          : `${validas.length} boletos importados${conPago}. La jornada se liquidará sola cuando estén todos los resultados.`)
          + conPartidosTxt,
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
        entradilla="Sube el Excel de la quiniela tal cual (hoja «Pronosticos»: una columna por persona, con su usuario de correo arriba). También vale la plantilla sencilla, con una fila por persona. No se guarda nada hasta que revises la previsualización."
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

        {oficina && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, paddingBottom: 4 }}>
            <input type="checkbox" checked={conPartidos} onChange={e => setConPartidos(e.target.checked)}
                   style={{ width: 16, height: 16 }} />
            Meter también los partidos y los resultados del Excel (corrige los signos que hayan cambiado)
          </label>
        )}

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
          {analisis.errores?.length > 0 && (
            <div className="aviso" style={{ marginTop: 20 }}>{analisis.errores.join(' ')}</div>
          )}

          {sinAlta.length > 0 && (
            <Seccion titulo="Gente del Excel que no está dada de alta"
                     nota={`${sinAlta.length} sin ficha`}
                     entradilla="El Excel los nombra por el usuario de su correo. Con el dominio se les crea la ficha con su correo completo, y su cuenta se enlazará sola cuando entren. Luego ponles un apodo en Participantes.">
              <div style={{ color: 'var(--tinta-2)', fontSize: 13, padding: '10px 0', fontFamily: 'var(--mono)' }}>
                {sinAlta.map(f => f.nombre).join(', ')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 12 }}>
                <span className="rotulo">Dominio del correo</span>
                <input value={dominio} placeholder="empresa.com" onChange={e => setDominio(e.target.value)}
                       style={{ width: 200 }} />
                <button className="principal" disabled={MODO_DEMO || !dominio.trim() || estado?.tipo === 'trabajando'}
                        onClick={darDeAlta}>
                  <UserPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  Dar de alta a los {sinAlta.length}
                </button>
              </div>
            </Seccion>
          )}

          {oficina && analisis.partidos.length > 0 && (
            <Seccion titulo="Partidos del Excel"
                     nota={conResultados ? `${resultados.filter(Boolean).length} con resultado` : 'Sin resultados todavía'}>
              <div className="tabla-scroll">
                <table>
                  <thead><tr><th style={{ width: 40 }}>Nº</th><th>Partido</th><th className="num">Resultado</th></tr></thead>
                  <tbody>
                    {analisis.partidos.map(p => (
                      <tr key={p.orden}>
                        <td className="posicion">{p.orden === 15 ? 'P15' : String(p.orden).padStart(2, '0')}</td>
                        <td>{p.local} – {p.visitante}</td>
                        <td className="num destaca">{p.resultado ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}

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
                    <th style={{ width: 40 }}>{oficina ? 'Col.' : 'Fila'}</th>
                    <th>Nombre</th>
                    <th>Columna</th>
                    {conResultados && <th className="num">Aciertos</th>}
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analisis.filas]
                .sort((a, b) => (conResultados ? puntuar(b.picks, resultados) - puntuar(a.picks, resultados) : 0))
                .map(f => (
                    <tr key={f.linea}>
                      <td className="posicion">{String(f.linea).padStart(2, '0')}</td>
                      <td style={{ fontWeight: 500 }}>
                        {f.nombre}
                        {f.jugador && f.jugador.nombre !== f.nombre && (
                          <div style={{ color: 'var(--tinta-3)', fontSize: 12, fontWeight: 400 }}>{f.jugador.apodo || f.jugador.nombre}</div>
                        )}
                      </td>
                      <td>
                        <div className="tira-signos">
                          {f.picks.map((p, i) => {
                            const r = resultados?.[i]
                            const clase = p === '-' ? 'fallo' : r ? (p === r ? 'acierto' : '') : ''
                            return <span key={i} className={`signo ${clase}`}>{p}</span>
                          })}
                        </div>
                      </td>
                      {conResultados && <td className="num destaca">{puntuar(f.picks, resultados)}</td>}
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
