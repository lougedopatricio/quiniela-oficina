import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ---------------------------------------------------------------------------
// Cómo se ha llegado a la clasificación de hoy.
//
// Ocho participantes son ocho líneas, y ocho colores a la vez no se leen: se
// convierte en un plato de espaguetis donde no se sigue a nadie. Aquí solo hay
// un color —el rojo de la casa— y se lo queda una persona cada vez; el resto
// son el contexto en gris. Se elige a quién seguir en la fila de nombres, que
// hace de leyenda y de mando a la vez.
//
// El acumulado no se interpola: quien se salta una jornada no suma esa semana
// y su línea sale plana, igual que le pasa en la general.
// ---------------------------------------------------------------------------

const GRIS = 'var(--tinta-3)'
const ROJO = 'var(--rojo)'

/** Marcador de la jornada sobre la que está el cursor, de más a menos aciertos. */
function Marcador({ active, payload, label, nombreDe, destacado }) {
  if (!active || !payload?.length) return null

  const filas = [...payload]
    .filter(p => p.value != null)
    .sort((a, b) => b.value - a.value)

  return (
    <div className="marcador-grafico">
      <div className="marcador-titulo">{label}</div>
      {filas.map((p, i) => {
        const esDestacado = p.dataKey === destacado
        return (
          <div key={p.dataKey} className={`marcador-fila ${esDestacado ? 'destacado' : ''}`}>
            <span className="puesto">{i + 1}</span>
            <span className="quien">{nombreDe[p.dataKey] ?? '—'}</span>
            <span className="cuanto">{p.value}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * @param jornadas  [{ round_id, numero }] finalizadas, en orden
 * @param acumulado { [player_id]: number[] } alineado con `jornadas`
 * @param tabla     la clasificación ya cargada, de donde salen los nombres
 *                  y el orden en que se ofrecen
 */
export default function Evolucion({ jornadas, acumulado, tabla }) {
  const participantes = tabla.filter(f => acumulado[f.player_id])
  const [destacado, setDestacado] = useState(participantes[0]?.player_id ?? null)

  // Con una sola jornada no hay evolución que contar, solo un punto.
  if (jornadas.length < 2 || participantes.length === 0) return null

  const nombreDe = Object.fromEntries(participantes.map(f => [f.player_id, f.nombre]))

  const filas = jornadas.map((j, i) => {
    const fila = { jornada: `J${j.numero}` }
    for (const f of participantes) fila[f.player_id] = acumulado[f.player_id][i]
    return fila
  })

  return (
    <>
      <div className="leyenda-evolucion">
        {participantes.map(f => (
          <button
            key={f.player_id}
            type="button"
            className={`chip-leyenda ${f.player_id === destacado ? 'activo' : ''}`}
            onClick={() => setDestacado(f.player_id)}
            aria-pressed={f.player_id === destacado}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      <div style={{ width: '100%', height: 260, marginTop: 12 }}>
        <ResponsiveContainer>
          <LineChart data={filas} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="var(--regla)" vertical={false} />
            <XAxis dataKey="jornada" stroke="var(--tinta-3)" fontSize={11} tickLine={false}
                   axisLine={{ stroke: 'var(--regla-fuerte)' }} />
            <YAxis stroke="var(--tinta-3)" fontSize={11} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: 'var(--tinta-3)', strokeDasharray: '3 3' }}
              content={<Marcador nombreDe={nombreDe} destacado={destacado} />}
            />
            {/* El orden de pintado no se toca: Recharts no respeta el de los
                hijos para las curvas, así que reordenarlas para poner el
                destacado encima no serviría. La diferencia la marcan el grosor
                y la opacidad, que sí son suyos. */}
            {participantes.map(f => {
              const esDestacado = f.player_id === destacado
              return (
                <Line
                  key={f.player_id}
                  type="monotone"
                  dataKey={f.player_id}
                  name={f.nombre}
                  stroke={esDestacado ? ROJO : GRIS}
                  strokeWidth={esDestacado ? 2 : 1}
                  strokeOpacity={esDestacado ? 1 : 0.45}
                  dot={esDestacado ? { r: 3, fill: ROJO, strokeWidth: 0 } : false}
                  activeDot={esDestacado ? { r: 5 } : { r: 3 }}
                  isAnimationActive={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
