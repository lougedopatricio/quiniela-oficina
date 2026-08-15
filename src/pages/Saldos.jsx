import { Link } from 'react-router-dom'
import { getSaldos } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Portada, Destacado, Seccion, Persona, Dinero } from '../components/ui.jsx'
import { euros } from '../lib/formato.js'
import { titularSaldos } from '../lib/titulares.js'

export default function Saldos() {
  const { cargando, error, datos } = useAsync(getSaldos, [])

  if (cargando) return <Cargando filas={6} />
  if (error) return <AvisoError error={error} />
  if (!datos?.length) return <Vacio>Todavía no hay movimientos.</Vacio>

  const deben = datos.filter(s => s.saldo_cents < 0)
  const deudaTotal = deben.reduce((a, s) => a + s.saldo_cents, 0)
  const premios = datos.reduce((a, s) => a + s.premios_cents, 0)

  return (
    <>
      <Portada
        antetitulo="La caja"
        titular={titularSaldos(datos)}
        entradilla="Cada jornada jugada resta la cuota y cada premio suma. El saldo no es un número apuntado a mano: es la suma de todos los movimientos, así que siempre se puede ver de dónde sale."
      >
        <div className="destacado">
          <Destacado rotulo="Pendiente de cobrar" valor={euros(-deudaTotal)} tono="acento"
                     nota={`${deben.length} persona${deben.length === 1 ? '' : 's'} con saldo negativo`} />
          <Destacado rotulo="Al día" valor={datos.length - deben.length}
                     nota="Sin nada pendiente" />
          <Destacado rotulo="Premios entregados" valor={euros(premios)}
                     nota="A lo largo de la temporada" />
        </div>
      </Portada>

      <Seccion titulo="Quién debe qué" nota="De más deuda a menos">
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Participante</th>
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
                  <td className="num" style={{ color: 'var(--tinta-3)' }}>−{euros(s.cuotas_cents)}</td>
                  <td className="num" style={{ color: 'var(--tinta-3)' }}>+{euros(s.premios_cents)}</td>
                  <td className="num" style={{ color: 'var(--tinta-3)' }}>+{euros(s.pagado_cents)}</td>
                  <td className="num destaca"><Dinero cents={s.saldo_cents} conSigno /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  )
}
