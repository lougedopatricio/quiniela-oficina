import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getTemporada, getBote } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Portada, Destacado, Seccion } from '../components/ui.jsx'
import { euros, fechaCorta } from '../lib/formato.js'
import { titularBote } from '../lib/titulares.js'

export default function Bote() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    return season ? { season, bote: await getBote(season.id) } : null
  }, [])

  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada abierta.</Vacio>

  const { season, bote } = datos
  const movimientos = [...bote.movimientos].sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0))
  const serie = movimientos.map(m => ({ jornada: `J${m.jornada ?? '?'}`, saldo: (m.saldo_cents ?? 0) / 100 }))
  const plenos = movimientos.filter(m => m.salida_cents > 0)
  const totalAportado = movimientos.reduce((a, m) => a + m.aporte_cents, 0)

  return (
    <>
      <Portada
        antetitulo={season.nombre}
        titular={titularBote(bote.actual_cents, plenos.length)}
        entradilla="La mitad de lo que se recauda cada jornada se queda aquí. Quien acierte los catorce se lo lleva entero; si nadie lo revienta antes de que acabe la temporada, acaba en cena."
      >
        <div className="destacado">
          <Destacado rotulo="En el bote ahora" valor={euros(bote.actual_cents)} tono="oro"
                     nota="Acumulado desde el último pleno" />
          <Destacado rotulo="Aportado en total" valor={euros(totalAportado)}
                     nota={`A lo largo de ${movimientos.length} jornada${movimientos.length === 1 ? '' : 's'}`} />
          <Destacado rotulo="Veces que ha caído" valor={plenos.length}
                     nota={plenos.length ? `El último en la jornada ${plenos.at(-1).jornada}` : 'Todavía nadie ha hecho pleno'} />
        </div>
      </Portada>

      {serie.length > 1 && (
        <Seccion titulo="Cómo ha ido creciendo" nota="Saldo al cierre de cada jornada">
          <div style={{ width: '100%', height: 250, marginTop: 14 }}>
            <ResponsiveContainer>
              <AreaChart data={serie} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--regla)" vertical={false} />
                <XAxis dataKey="jornada" stroke="var(--tinta-3)" fontSize={11} tickLine={false}
                       axisLine={{ stroke: 'var(--regla-fuerte)' }} />
                <YAxis stroke="var(--tinta-3)" fontSize={11} tickLine={false} axisLine={false}
                       tickFormatter={v => `${v} €`} width={54} />
                <Tooltip
                  formatter={v => [`${v.toFixed(2)} €`, 'Bote']}
                  contentStyle={{
                    background: 'var(--papel)', border: '1px solid var(--regla-fuerte)',
                    borderRadius: 2, color: 'var(--tinta)', fontFamily: 'var(--mono)', fontSize: 12,
                  }}
                />
                <Area type="stepAfter" dataKey="saldo" stroke="var(--oro)" strokeWidth={2}
                      fill="var(--oro-suave)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Movimientos" nota="Lo que entra y lo que sale">
        {movimientos.length === 0 ? (
          <Vacio>El bote todavía está por estrenar.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Jornada</th>
                  <th>Concepto</th>
                  <th className="num">Entra</th>
                  <th className="num">Sale</th>
                  <th className="num">Queda</th>
                </tr>
              </thead>
              <tbody>
                {[...movimientos].reverse().map((m, i) => (
                  <tr key={m.id ?? i}>
                    <td>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>Jornada {m.jornada ?? '—'}</span>
                      <div style={{ color: 'var(--tinta-3)', fontSize: 12 }}>{fechaCorta(m.fecha)}</div>
                    </td>
                    <td>{m.motivo}</td>
                    <td className="num" style={{ color: 'var(--verde)' }}>{euros(m.aporte_cents)}</td>
                    <td className="num" style={{ color: m.salida_cents > 0 ? 'var(--rojo)' : 'var(--tinta-3)' }}>
                      {m.salida_cents > 0 ? `−${euros(m.salida_cents)}` : '—'}
                    </td>
                    <td className="num destaca">{euros(m.saldo_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </>
  )
}
