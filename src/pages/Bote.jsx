import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { getTemporada, getBote } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Dato, Dinero } from '../components/ui.jsx'
import { euros, fechaCorta } from '../lib/formato.js'

export default function Bote() {
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    return season ? { season, bote: await getBote(season.id) } : null
  }, [])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No hay temporada activa.</Vacio>

  const { bote } = datos
  const movimientos = [...bote.movimientos].sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0))
  const serie = movimientos.map(m => ({
    jornada: `J${m.jornada ?? '?'}`,
    saldo: (m.saldo_cents ?? 0) / 100,
  }))
  const plenos = movimientos.filter(m => m.salida_cents > 0)
  const totalAportado = movimientos.reduce((a, m) => a + m.aporte_cents, 0)

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>El bote</h1>
          <p>La mitad de cada jornada se acumula aquí. Quien haga 14 se lo lleva entero; si nadie lo revienta, la temporada acaba en cena.</p>
        </div>
      </div>

      <div className="rejilla c3">
        <Dato etiqueta="Bote actual" valor={euros(bote.actual_cents)} color="var(--oro)"
              nota="Lo que hay ahora mismo" />
        <Dato etiqueta="Aportado en total" valor={euros(totalAportado)}
              nota={`En ${movimientos.length} jornadas`} />
        <Dato etiqueta="Plenos" valor={plenos.length}
              nota={plenos.length ? `Último en la J${plenos.at(-1).jornada}` : 'Todavía nadie'} />
      </div>

      {serie.length > 1 && (
        <>
          <div className="encabezado-seccion"><h2>Cómo ha evolucionado</h2></div>
          <div className="tarjeta">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={serie} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gBote" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="var(--oro)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="var(--oro)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--borde)" vertical={false} />
                  <XAxis dataKey="jornada" stroke="var(--texto-suave)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--texto-suave)" fontSize={12} tickLine={false} axisLine={false}
                         tickFormatter={v => `${v} €`} width={58} />
                  <Tooltip
                    formatter={v => [`${v.toFixed(2)} €`, 'Bote']}
                    contentStyle={{
                      background: 'var(--superficie)', border: '1px solid var(--borde)',
                      borderRadius: 10, color: 'var(--texto)',
                    }}
                  />
                  <Area type="monotone" dataKey="saldo" stroke="var(--oro)" strokeWidth={2.4} fill="url(#gBote)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div className="encabezado-seccion"><h2>Movimientos</h2></div>
      {movimientos.length === 0 ? (
        <Vacio>El bote todavía está vacío.</Vacio>
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Jornada</th>
                  <th>Concepto</th>
                  <th className="num">Entra</th>
                  <th className="num">Sale</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...movimientos].reverse().map((m, i) => (
                  <tr key={m.id ?? i}>
                    <td>
                      <strong>J{m.jornada ?? '—'}</strong>
                      <div style={{ color: 'var(--texto-suave)', fontSize: '.78rem' }}>{fechaCorta(m.fecha)}</div>
                    </td>
                    <td>{m.motivo}</td>
                    <td className="num"><Dinero cents={m.aporte_cents} /></td>
                    <td className="num">
                      {m.salida_cents > 0 ? <span className="dinero negativo">−{euros(m.salida_cents)}</span> : '—'}
                    </td>
                    <td className="num"><strong>{euros(m.saldo_cents)}</strong></td>
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
