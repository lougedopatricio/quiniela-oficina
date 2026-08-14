import { Link } from 'react-router-dom'
import { getSaldos } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Dato, Persona, Dinero } from '../components/ui.jsx'
import { euros } from '../lib/formato.js'

export default function Saldos() {
  const { cargando, error, datos } = useAsync(getSaldos, [])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />
  if (!datos?.length) return <Vacio>Todavía no hay movimientos.</Vacio>

  const deben = datos.filter(s => s.saldo_cents < 0)
  const deudaTotal = deben.reduce((a, s) => a + s.saldo_cents, 0)

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <h1>Saldos</h1>
          <p>Cada jornada jugada resta la cuota y cada premio suma. El saldo es la suma de todos los movimientos, nunca un número guardado a mano.</p>
        </div>
      </div>

      <div className="rejilla c3">
        <Dato etiqueta="Pendiente de cobrar" valor={euros(-deudaTotal)} color="var(--rojo)"
              nota={`${deben.length} persona${deben.length === 1 ? '' : 's'}`} />
        <Dato etiqueta="Al día" valor={datos.length - deben.length} nota="Sin deuda" />
        <Dato etiqueta="Premios repartidos"
              valor={euros(datos.reduce((a, s) => a + s.premios_cents, 0))} />
      </div>

      <div className="encabezado-seccion"><h2>Quién debe qué</h2></div>
      <div className="tarjeta" style={{ padding: 0 }}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Jugador</th>
                <th className="num">Cuotas</th>
                <th className="num">Premios</th>
                <th className="num">Entregado</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {datos.map(s => (
                <tr key={s.player_id}>
                  <td><Link to={`/perfil/${s.player_id}`}><Persona nombre={s.nombre} /></Link></td>
                  <td className="num" style={{ color: 'var(--texto-suave)' }}>−{euros(s.cuotas_cents)}</td>
                  <td className="num" style={{ color: 'var(--texto-suave)' }}>+{euros(s.premios_cents)}</td>
                  <td className="num" style={{ color: 'var(--texto-suave)' }}>+{euros(s.pagado_cents)}</td>
                  <td className="num"><strong><Dinero cents={s.saldo_cents} conSigno /></strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
