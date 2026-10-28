import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { getTemporada, getDatosRanking } from '../lib/api.js'
import { calcularRanking, ordenarPor, CRITERIOS } from '../lib/ranking.js'
import { useAsync, Cargando, Vacio, AvisoError, Portada, Seccion, Avatar } from '../components/ui.jsx'
import { decimal, iniciales } from '../lib/formato.js'

// ---------------------------------------------------------------------------
// Ranking: la temporada mirada desde todos los ángulos.
//
// Arriba, una línea por persona con su foto al final. Treinta líneas de
// colores no se leen, así que hay cuatro colores para quien se quiera seguir
// (se eligen tocando su nombre) y el resto queda de contexto en gris. El
// color va con la persona, no con el puesto: reordenar la tabla no repinta
// a nadie.
//
// Abajo, la tabla, que se ordena por cualquier columna.
// ---------------------------------------------------------------------------

// Validada con el script de la guía de visualización (contraste, daltonismo):
// el rojo de la casa y tres más. El aqua queda por debajo de 3:1 contra el
// papel, por eso cada línea lleva la foto al final y está la tabla debajo.
const COLORES = ['#a8321e', '#2a78d6', '#1baf7a', '#6250d6']
const GRIS = 'var(--tinta-3)'
const MAX_DESTACADOS = COLORES.length

const formatear = (v, fmt) => {
  if (v == null) return '—'
  if (fmt === 'pct') return `${Math.round(v * 100)} %`
  if (fmt === 'decimal') return decimal(v)
  return v
}

export default function Ranking() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const { jornadas, jugadores } = await getDatosRanking(season.id)
    return { season, ...calcularRanking(jornadas, jugadores) }
  }, [])

  const [criterio, setCriterio] = useState('aciertos')
  const [ascendente, setAscendente] = useState(false)
  const [vista, setVista] = useState('acumulado')
  // null = todavía sin tocar: se destacan los tres primeros de la general.
  const [elegidos, setElegidos] = useState(null)

  const filas = datos?.filas ?? []
  const ordenadas = useMemo(() => ordenarPor(filas, criterio, ascendente), [filas, criterio, ascendente])
  const general = useMemo(() => ordenarPor(filas, 'aciertos'), [filas])

  if (cargando) return <Cargando filas={8} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta.</Vacio>
  if (!filas.length) return <Vacio>Todavía no hay ninguna jornada terminada: el ranking empieza con la primera.</Vacio>

  const destacados = elegidos ?? general.slice(0, 3).map(f => f.player_id)
  const colorDe = Object.fromEntries(destacados.map((id, i) => [id, COLORES[i]]))
  const c = CRITERIOS.find(x => x.id === criterio)
  const lider = ordenadas[0]

  function alternar(id) {
    const actual = elegidos ?? destacados
    if (actual.includes(id)) return setElegidos(actual.filter(x => x !== id))
    // Con los cuatro colores ocupados, el nuevo sustituye al más antiguo.
    setElegidos([...actual, id].slice(-MAX_DESTACADOS))
  }

  function ordenar(id) {
    if (id === criterio) setAscendente(a => !a)
    else { setCriterio(id); setAscendente(false) }
  }

  return (
    <>
      <Portada
        antetitulo={`Ranking · ${datos.season.nombre}`}
        titular={`${lider.nombre} manda en ${c.txt.toLowerCase()}`}
        entradilla={`${filas.length} participantes y ${datos.jornadas.length} jornada${datos.jornadas.length === 1 ? '' : 's'} terminada${datos.jornadas.length === 1 ? '' : 's'}. Toca un nombre para seguir su línea; toca una columna para ordenar por ella.`}
      />

      <Seccion
        titulo="Cómo va cada uno"
        accion={
          <div className="pestanas-mini">
            <button type="button" className={vista === 'acumulado' ? 'activo' : ''} onClick={() => setVista('acumulado')}>Acumulado</button>
            <button type="button" className={vista === 'jornada' ? 'activo' : ''} onClick={() => setVista('jornada')}>Por jornada</button>
          </div>
        }
      >
        <div className="leyenda-evolucion" role="group" aria-label="A quién seguir">
          {general.map(f => (
            <button key={f.player_id} type="button"
                    className={`chip-leyenda chip-ranking ${colorDe[f.player_id] ? 'activo' : ''}`}
                    style={colorDe[f.player_id] ? { borderColor: colorDe[f.player_id], boxShadow: `inset 0 0 0 1px ${colorDe[f.player_id]}` } : undefined}
                    aria-pressed={!!colorDe[f.player_id]}
                    onClick={() => alternar(f.player_id)}>
              <span style={colorDe[f.player_id] ? { borderRadius: '50%', boxShadow: `0 0 0 2px ${colorDe[f.player_id]}`, display: 'inline-flex' } : { display: 'inline-flex' }}>
                <Avatar nombre={f.nombre} foto={f.avatar_url} tamano={18} />
              </span>
              {f.nombre}
            </button>
          ))}
        </div>
        <Grafica jornadas={datos.jornadas} filas={general} colorDe={colorDe} vista={vista} />
      </Seccion>

      <Seccion titulo="La tabla" nota={c.nota}>
        <label className="solo-movil" style={{ gap: 4, padding: '12px 0 4px' }}>
          <span className="rotulo">Ordenar por</span>
          <select value={criterio} onChange={e => { setCriterio(e.target.value); setAscendente(false) }}>
            {CRITERIOS.map(x => <option key={x.id} value={x.id}>{x.txt}</option>)}
          </select>
        </label>
        <div className="tabla-scroll">
          <table className="tabla-ranking">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>Participante</th>
                {CRITERIOS.map(x => (
                  <th key={x.id} className={`num ordenable ${x.id === criterio ? 'activa' : ''}`} title={x.nota ?? x.txt}
                      aria-sort={x.id === criterio ? (ascendente ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => ordenar(x.id)}>
                      {x.corto}
                      {x.id === criterio && (ascendente ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f, i) => (
                <tr key={f.player_id}>
                  <td className="posicion">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <Link to={`/perfil/${f.player_id}`} className="persona">
                      <span style={colorDe[f.player_id] ? { borderRadius: '50%', boxShadow: `0 0 0 2px ${colorDe[f.player_id]}` } : undefined}>
                        <Avatar nombre={f.nombre} foto={f.avatar_url} tamano={28} />
                      </span>
                      <span className="nombre">{f.nombre}</span>
                    </Link>
                  </td>
                  {CRITERIOS.map(x => (
                    <td key={x.id} className={`num ${x.id === criterio ? 'destaca' : ''}`}>{formatear(x.valor(f), x.fmt)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', marginTop: 10 }}>
          Solo cuentan las jornadas terminadas. Los porcentajes son sobre los partidos que puntúan por
          signo (sin el pleno ni los aplazados); «Local», «Empate» y «Visitante» miran los partidos que
          acabaron así. A igualdad, manda la general.
        </p>
      </Seccion>
    </>
  )
}

/** La gráfica de líneas, con la foto de cada uno al final de la suya. */
function Grafica({ jornadas, filas, colorDe, vista }) {
  const clave = vista === 'acumulado' ? 'serie' : 'porJornada'
  const datos = jornadas.map((j, i) => {
    const fila = { jornada: `J${j.numero}` }
    for (const f of filas) fila[f.player_id] = f[clave][i]
    return fila
  })
  const ultimo = datos.length - 1
  const nombreDe = Object.fromEntries(filas.map(f => [f.player_id, f]))
  // Los destacados se pintan los últimos para que queden encima.
  const enOrden = [...filas].sort((a, b) => (colorDe[a.player_id] ? 1 : 0) - (colorDe[b.player_id] ? 1 : 0))

  return (
    <div style={{ width: '100%', height: 340, marginTop: 14 }}>
      <ResponsiveContainer>
        <LineChart data={datos} margin={{ top: 14, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--regla)" vertical={false} />
          <XAxis dataKey="jornada" stroke="var(--tinta-3)" fontSize={11} tickLine={false}
                 axisLine={{ stroke: 'var(--regla-fuerte)' }} padding={{ right: 8 }} />
          <YAxis stroke="var(--tinta-3)" fontSize={11} tickLine={false} axisLine={false} width={34}
                 allowDecimals={false} domain={vista === 'jornada' ? [0, 15] : [0, 'auto']} />
          <Tooltip cursor={{ stroke: 'var(--tinta-3)', strokeDasharray: '3 3' }}
                   content={<Marcador nombreDe={nombreDe} colorDe={colorDe} />} />
          {enOrden.map(f => {
            const color = colorDe[f.player_id]
            return (
              <Line key={f.player_id} type="monotone" dataKey={f.player_id} name={f.nombre}
                    stroke={color ?? GRIS} strokeWidth={color ? 2 : 1} strokeOpacity={color ? 1 : 0.4}
                    connectNulls={vista === 'jornada'}
                    isAnimationActive={false}
                    activeDot={{ r: color ? 5 : 3, stroke: 'var(--papel)', strokeWidth: 2 }}
                    dot={(p) => <PuntoConFoto key={`${f.player_id}-${p.index}`} {...p} jugador={f} color={color}
                                              ultimo={p.index === ultimoDe(f, clave, ultimo)} />} />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// El último punto con dato de cada uno: en la vista «por jornada», quien no
// jugó la última no tiene punto ahí, y la foto se queda en su última jornada.
function ultimoDe(f, clave, ultimo) {
  for (let i = ultimo; i >= 0; i--) if (f[clave][i] != null) return i
  return ultimo
}

/** Punto de cada jornada; en la última, la foto de la persona en un círculo. */
function PuntoConFoto({ cx, cy, value, ultimo, jugador, color }) {
  if (cx == null || cy == null || value == null) return null
  if (!ultimo) {
    return color ? <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="var(--papel)" strokeWidth={1} /> : null
  }
  const r = color ? 12 : 8
  const id = `foto-${jugador.player_id}`
  return (
    <g opacity={color ? 1 : 0.55}>
      <title>{`${jugador.nombre}: ${value}`}</title>
      <defs><clipPath id={id}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
      <circle cx={cx} cy={cy} r={r + 2} fill={color ?? 'var(--papel)'} stroke={color ? 'none' : 'var(--regla-fuerte)'} strokeWidth={0.6} />
      {jugador.avatar_url ? (
        <image href={jugador.avatar_url} x={cx - r} y={cy - r} width={r * 2} height={r * 2}
               clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={r} fill="var(--papel)" />
          <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={r * 0.8} fontWeight={600}
                fill="var(--tinta)" style={{ fontFamily: 'var(--sans)' }}>{iniciales(jugador.nombre)}</text>
        </>
      )}
    </g>
  )
}

/** Recuadro al pasar por una jornada: los destacados primero, luego el resto. */
function Marcador({ active, payload, label, nombreDe, colorDe }) {
  if (!active || !payload?.length) return null
  const filas = payload
    .filter(p => p.value != null)
    .sort((a, b) => (colorDe[b.dataKey] ? 1 : 0) - (colorDe[a.dataKey] ? 1 : 0) || b.value - a.value)
  const visibles = filas.slice(0, 8)
  return (
    <div className="marcador-grafico">
      <div className="marcador-titulo">{label}</div>
      {visibles.map(p => (
        <div key={p.dataKey} className="marcador-fila" style={colorDe[p.dataKey] ? { color: 'var(--tinta)', fontWeight: 600 } : undefined}>
          <span className="puesto" style={{ background: colorDe[p.dataKey] ?? 'transparent', width: 8, height: 8, borderRadius: '50%', display: 'inline-block', border: colorDe[p.dataKey] ? 'none' : '1px solid var(--tinta-3)' }} />
          <span className="quien">{nombreDe[p.dataKey]?.nombre ?? '—'}</span>
          <span className="cuanto">{p.value}</span>
        </div>
      ))}
      {filas.length > visibles.length && (
        <div style={{ fontSize: 11, color: 'var(--tinta-3)', marginTop: 4 }}>y {filas.length - visibles.length} más</div>
      )}
    </div>
  )
}
