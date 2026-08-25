import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { getSaldos, registrarMovimiento, borrarMovimiento, getMovimientosManuales } from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio, Persona, Dinero, Destacado } from '../../components/ui.jsx'
import { euros, fechaCorta } from '../../lib/formato.js'

export default function Caja() {
  const [recarga, setRecarga] = useState(0)
  const [form, setForm] = useState({ player_id: '', euros: '', tipo: 'pago', nota: '' })
  const [aviso, setAviso] = useState(null)

  const { cargando, error, datos } = useAsync(async () => {
    const [saldos, movimientos] = await Promise.all([getSaldos(), getMovimientosManuales()])
    return { saldos, movimientos }
  }, [recarga])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />

  const { saldos, movimientos } = datos
  const refrescar = () => setRecarga(n => n + 1)
  const deben = saldos.filter(s => s.saldo_cents < 0)
  const deudaTotal = deben.reduce((a, s) => a + s.saldo_cents, 0)

  async function anotar(e) {
    e.preventDefault()
    // El importe se teclea en euros porque es lo natural; la base solo guarda
    // céntimos enteros, así que se convierte aquí y se redondea una sola vez.
    const cents = Math.round(parseFloat(String(form.euros).replace(',', '.')) * 100)
    if (!form.player_id || !Number.isFinite(cents) || cents === 0) {
      return setAviso({ tipo: 'error', txt: 'Elige a alguien y pon un importe distinto de cero.' })
    }
    try {
      await registrarMovimiento({
        player_id: form.player_id,
        tipo: form.tipo,
        importe_cents: cents,
        nota: form.nota.trim() || (form.tipo === 'pago' ? 'Pago en efectivo' : 'Ajuste manual'),
      })
      setForm({ player_id: '', euros: '', tipo: 'pago', nota: '' })
      setAviso({ tipo: 'ok', txt: 'Movimiento anotado.' })
      refrescar()
    } catch (err) { setAviso({ tipo: 'error', txt: err.message }) }
  }

  async function borrar(m) {
    if (!confirm('¿Borrar este movimiento?')) return
    try { await borrarMovimiento(m.id); refrescar() } catch (err) {
      setAviso({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="La caja de la quiniela"
        entradilla="Aquí solo se anotan pagos y ajustes: el dinero que alguien te da en mano. Las cuotas y los premios los calcula la base al liquidar cada jornada y se rehacen en cada recálculo, así que no se tocan desde aquí."
      >
        <div className="destacado">
          <Destacado rotulo="Pendiente de cobrar" valor={euros(-deudaTotal)} tono="acento"
                     nota={`${deben.length} persona${deben.length === 1 ? '' : 's'}`} />
          <Destacado rotulo="Al día" valor={saldos.length - deben.length} nota="Sin deuda" />
          <Destacado rotulo="Recibido en mano"
                     valor={euros(movimientos.filter(m => m.tipo === 'pago').reduce((a, m) => a + m.importe_cents, 0))}
                     nota="Suma de todos los pagos" />
        </div>
      </Portada>

      {aviso && <div className="aviso" style={{ marginTop: 20 }}>{aviso.txt}</div>}

      <Seccion titulo="Anotar un movimiento">
        <form onSubmit={anotar} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', padding: '14px 0' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Participante</span>
            <select value={form.player_id} onChange={e => setForm({ ...form, player_id: e.target.value })}>
              <option value="">Elige…</option>
              {saldos.map(s => (
                <option key={s.player_id} value={s.player_id}>
                  {s.nombre} ({euros(s.saldo_cents)})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Tipo</span>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="pago">Pago recibido</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Importe en euros</span>
            {/* type="number" en vez de texto libre: el navegador ya resuelve
                la ambigüedad coma/punto y descarta un segundo separador antes
                de que llegue al parseFloat de abajo. Sin min: un "ajuste"
                puede ser negativo, para corregir un apunte de más. */}
            <input type="number" inputMode="decimal" step="0.01"
                   value={form.euros} placeholder="5,00" style={{ width: 90 }}
                   onChange={e => setForm({ ...form, euros: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 160 }}>
            <span className="rotulo">Concepto</span>
            <input value={form.nota} placeholder="Pagó 5 jornadas de golpe"
                   onChange={e => setForm({ ...form, nota: e.target.value })} />
          </label>
          <button className="principal" type="submit">Anotar</button>
        </form>
        <p style={{ color: 'var(--tinta-3)', fontSize: 13, margin: 0 }}>
          Un pago se anota en positivo: sube el saldo de esa persona hacia cero. Para
          corregir algo a la baja, usa un ajuste con importe negativo.
        </p>
      </Seccion>

      <Seccion titulo="Cómo va cada uno" nota="De más deuda a menos">
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
              {saldos.map(s => (
                <tr key={s.player_id}>
                  <td><Persona nombre={s.nombre} /></td>
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

      <Seccion titulo="Pagos y ajustes anotados">
        {movimientos.length === 0 ? (
          <Vacio>Todavía no has anotado ningún movimiento.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Fecha</th>
                  <th>Participante</th>
                  <th>Concepto</th>
                  <th className="num">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  // Los movimientos del modo demo no llevan id; con datos
                  // reales siempre lo hay y es el que manda.
                  <tr key={m.id ?? `demo-${i}`}>
                    <td style={{ color: 'var(--tinta-3)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                      {fechaCorta(m.fecha)}
                    </td>
                    <td>{m.players?.nombre ?? '—'}</td>
                    <td>{m.nota}</td>
                    <td className="num"><Dinero cents={m.importe_cents} conSigno /></td>
                    <td className="num">
                      <button style={{ padding: '5px 9px' }} onClick={() => borrar(m)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
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
