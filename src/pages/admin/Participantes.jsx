import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Trash2, Plus, Check, X } from 'lucide-react'
import {
  getParticipantes, crearParticipante, actualizarParticipante,
  borrarParticipante, enviarEnlaceAcceso, getCuentasSinFicha, vincularCuenta,
} from '../../lib/api.js'
import {
  useAsync, Cargando, AvisoError, Portada, Seccion, Dinero, Avatar, Destacado, Vacio,
} from '../../components/ui.jsx'
import CambiarFoto from '../../components/CambiarFoto.jsx'
import { fechaCorta, fechaHora, haceCuanto, nombreVisible } from '../../lib/formato.js'
import { useSesion } from '../../lib/sesion.js'
import { MODO_DEMO } from '../../lib/supabase.js'

const VACIO = { nombre: '', apodo: '', alias: '', email: '', alternativos: '' }

/**
 * Los filtros de la plantilla. Cada uno responde a una pregunta que el
 * administrador se hace de verdad un viernes por la tarde.
 */
const FILTROS = [
  { id: 'todos',     txt: 'Todos',                    pasa: () => true },
  { id: 'sin-jugar', txt: 'Sin columna esta jornada', pasa: p => p.activo && p.juega_abierta === false },
  { id: 'deben',     txt: 'Deben dinero',             pasa: p => p.saldo_cents < 0 },
  { id: 'sin-cuenta',txt: 'Sin cuenta enlazada',      pasa: p => !p.user_id },
  { id: 'sin-apodo', txt: 'Sin apodo ni foto',        pasa: p => !p.apodo || !p.avatar_url },
  { id: 'inactivos', txt: 'Inactivos',                pasa: p => !p.activo },
]

export default function Participantes() {
  // En demo no hay sesión, así que se enseña como dueño para poder ver la
  // pantalla entera; con base real manda lo que diga la ficha.
  const sesionReal = useSesion()
  const sesion = MODO_DEMO ? { ...sesionReal, esDuenyo: true } : sesionReal
  const [recarga, setRecarga] = useState(0)
  const [nuevo, setNuevo] = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  const { cargando, error, datos } = useAsync(getParticipantes, [recarga])
  // En su propia carga: que fallara al leer las cuentas sueltas no debe dejar
  // sin plantilla a quien solo venía a editar un alias.
  const cuentas = useAsync(getCuentasSinFicha, [recarga])

  // Solo la primera carga tapa la pantalla: al refrescar tras guardar, la
  // tabla se queda donde estaba en vez de parpadear.
  if (cargando && !datos) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />

  const refrescar = () => setRecarga(n => n + 1)
  const fallo = (e) => setAviso({ tipo: 'error', txt: e.message })

  async function anadir(e) {
    e.preventDefault()
    try {
      await crearParticipante({
        nombre: nuevo.nombre.trim(),
        apodo: nuevo.apodo.trim() || null,
        alias: nuevo.alias.trim() || nuevo.nombre.trim().toLowerCase().split(/\s+/)[0],
        email: nuevo.email.trim(),
        alias_alternativos: nuevo.alternativos.split(',').map(s => s.trim()).filter(Boolean),
      })
      setNuevo(VACIO)
      setAviso({ tipo: 'ok', txt: 'Participante añadido.' })
      refrescar()
    } catch (err) { fallo(err) }
  }

  async function guardar(p) {
    try {
      await actualizarParticipante(p.id, {
        nombre: editando.nombre.trim(),
        apodo: editando.apodo.trim() || null,
        alias: editando.alias.trim(),
        email: editando.email.trim() || null,
        alias_alternativos: editando.alternativos.split(',').map(s => s.trim()).filter(Boolean),
      })
      setEditando(null)
      refrescar()
    } catch (err) { fallo(err) }
  }

  async function alternar(p, campo) {
    try {
      await actualizarParticipante(p.id, { [campo]: !p[campo] })
      refrescar()
    } catch (err) { fallo(err) }
  }

  async function borrar(p) {
    if (!confirm(`¿Borrar a ${p.nombre}? Se irán también sus boletos y sus movimientos de caja. Si solo quieres que deje de jugar, desactívalo en vez de borrarlo.`)) return
    try {
      await borrarParticipante(p.id)
      refrescar()
    } catch (err) { fallo(err) }
  }

  async function enlace(p) {
    if (!p.email) return setAviso({ tipo: 'error', txt: `${p.nombre} no tiene correo.` })
    try {
      await enviarEnlaceAcceso(p.email)
      setAviso({ tipo: 'ok', txt: `Enlace de acceso enviado a ${p.email}.` })
    } catch (err) { fallo(err) }
  }

  async function altaDesdeCuenta(cuenta, nombre) {
    try {
      await crearParticipante({
        nombre: nombre.trim(),
        alias: nombre.trim().toLowerCase().split(/\s+/)[0],
        email: cuenta.email,
        user_id: cuenta.user_id,
      })
      setAviso({ tipo: 'ok', txt: `${nombre.trim()} ya es participante, con su cuenta enlazada.` })
      refrescar()
    } catch (err) { fallo(err) }
  }

  async function vincularACuenta(cuenta, playerId) {
    const p = datos.find(x => x.id === playerId)
    try {
      await vincularCuenta(playerId, cuenta.user_id)
      setAviso({ tipo: 'ok', txt: `${cuenta.email} enlazado con ${p?.nombre ?? 'el participante'}.` })
      refrescar()
    } catch (err) { fallo(err) }
  }

  const sinVincular = datos.filter(p => !p.user_id).length
  const huerfanas = cuentas.datos ?? []

  // El resumen de arriba: lo que hay que mirar sin tener que leer la tabla.
  const activos = datos.filter(p => p.activo)
  const hayAbierta = datos.some(p => p.juega_abierta !== null && p.juega_abierta !== undefined)
  const hanJugado = activos.filter(p => p.juega_abierta).length
  const deudores = datos.filter(p => p.saldo_cents < 0)
  const deuda = deudores.reduce((a, p) => a + p.saldo_cents, 0)
  const entraronSemana = datos.filter(p => p.ultima_entrada && Date.now() - new Date(p.ultima_entrada) < 7 * 864e5).length

  const filtroActual = FILTROS.find(f => f.id === filtro) ?? FILTROS[0]
  const visibles = datos.filter(filtroActual.pasa)

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Quién juega la quiniela"
        entradilla="El alias es lo que el importador busca en la primera columna del Excel. Si alguien aparece escrito de varias formas, añádelas como alias alternativos y dejará de dar problemas."
      />

      <div className="destacado cuatro">
        <Destacado rotulo="En plantilla" valor={activos.length}
                   nota={datos.length > activos.length ? `y ${datos.length - activos.length} inactivos` : 'Todos activos'} />
        <Destacado rotulo="Jornada abierta"
                   valor={hayAbierta ? `${hanJugado}/${activos.length}` : '—'}
                   tono={hayAbierta && hanJugado < activos.length ? 'acento' : undefined}
                   nota={hayAbierta
                     ? (hanJugado < activos.length ? `Faltan ${activos.length - hanJugado} columnas` : 'Ya han jugado todos')
                     : 'No hay ninguna abierta'} />
        <Destacado rotulo="Deben" valor={deudores.length}
                   tono={deudores.length ? 'acento' : undefined}
                   nota={deudores.length ? <Dinero cents={deuda} /> : 'Nadie debe nada'} />
        <Destacado rotulo="Han entrado" valor={entraronSemana}
                   nota={`esta semana · ${sinVincular} sin cuenta`} />
      </div>

      {aviso && (
        <div className="aviso" style={{ marginTop: 20 }}>{aviso.txt}</div>
      )}

      <Seccion titulo="Añadir participante"
               entradilla="Con el correo puesto, su cuenta se enlaza sola en cuanto entre por primera vez.">
        <form onSubmit={anadir} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', padding: '14px 0' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Nombre</span>
            <input required value={nuevo.nombre} placeholder="Marta Ruiz"
                   onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Apodo (lo que sale en la clasificación)</span>
            <input value={nuevo.apodo} placeholder="La Jefa" maxLength={24}
                   onChange={e => setNuevo({ ...nuevo, apodo: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Alias (para el Excel)</span>
            <input value={nuevo.alias} placeholder="marta"
                   onChange={e => setNuevo({ ...nuevo, alias: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Correo</span>
            <input type="email" value={nuevo.email} placeholder="marta@empresa.com"
                   onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Otras formas, separadas por comas</span>
            <input value={nuevo.alternativos} placeholder="Marta R., martita"
                   onChange={e => setNuevo({ ...nuevo, alternativos: e.target.value })} />
          </label>
          <button className="principal" type="submit">
            <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Añadir
          </button>
        </form>
      </Seccion>

      {/* Solo aparece cuando hay algo que resolver: si nadie ha entrado con un
          correo desconocido, esta sección no tiene por qué ocupar sitio. */}
      {(cuentas.cargando || huerfanas.length > 0) && (
        <Seccion
          titulo="Cuentas sin participante"
          nota={huerfanas.length ? `${huerfanas.length} por asignar` : undefined}
          entradilla="Alguien ha entrado con un correo que no está dado de alta. Su cuenta funciona, pero no juega a nada hasta que la asignes: dale de alta como participante nuevo, o enlázala con una ficha que ya existiera."
        >
          {cuentas.cargando ? <Cargando filas={2} />
            : cuentas.error ? <AvisoError error={cuentas.error} />
            : (
              <div className="tabla-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th style={{ width: 100 }}>Se registró</th>
                      <th style={{ width: 100 }}>Última vez</th>
                      <th>Qué hacer con ella</th>
                    </tr>
                  </thead>
                  <tbody>
                    {huerfanas.map(c => (
                      <FilaCuenta
                        key={c.user_id}
                        cuenta={c}
                        candidatos={datos.filter(p => !p.user_id)}
                        alDarDeAlta={altaDesdeCuenta}
                        alVincular={vincularACuenta}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Seccion>
      )}

      <Seccion titulo="La plantilla"
               nota={sinVincular ? `${sinVincular} sin cuenta enlazada` : 'Todos con cuenta'}
               entradilla="El apodo y la foto son lo que ve el resto en la clasificación; si no hay apodo, sale el nombre. Cada uno puede cambiarse los suyos desde «Mi expediente»."
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 0 4px' }}>
          {FILTROS.map(f => {
            const n = datos.filter(f.pasa).length
            return (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                      className={filtro === f.id ? 'principal' : undefined}
                      style={{ padding: '4px 10px', fontSize: 12.5 }}>
                {f.txt} <span style={{ opacity: .65 }}>{n}</span>
              </button>
            )
          })}
        </div>

        {visibles.length === 0 ? (
          <Vacio>Nadie en «{filtroActual.txt.toLowerCase()}».</Vacio>
        ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Participante</th>
                <th>Alias en el Excel</th>
                <th>Correo</th>
                <th>Actividad</th>
                <th className="num" style={{ paddingRight: 20 }}>Saldo</th>
                <th style={{ paddingLeft: 4 }}>Permisos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(p => {
                const enEdicion = editando?.id === p.id
                return (
                  <tr key={p.id} style={p.activo ? undefined : { opacity: .5 }}>
                    <td>
                      {enEdicion ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <input value={editando.apodo} placeholder="apodo (opcional)" maxLength={24}
                                 style={{ width: 150 }}
                                 onChange={e => setEditando({ ...editando, apodo: e.target.value })} />
                          <input value={editando.nombre} placeholder="nombre real" style={{ width: 150 }}
                                 onChange={e => setEditando({ ...editando, nombre: e.target.value })} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Avatar nombre={nombreVisible(p)} foto={p.avatar_url} />
                            <CambiarFoto compacto playerId={p.id} tieneFoto={!!p.avatar_url}
                                         alCambiar={() => { setAviso({ tipo: 'ok', txt: `Foto de ${nombreVisible(p)} actualizada.` }); refrescar() }}
                                         alFallar={fallo} />
                          </div>
                        </div>
                      ) : (
                        <Link to={`/perfil/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nombre={nombreVisible(p)} foto={p.avatar_url} tamano={34} />
                          <span style={{ display: 'grid', minWidth: 0 }}>
                            <span style={{ fontWeight: 500 }}>{nombreVisible(p)}</span>
                            {p.apodo
                              ? <span style={{ color: 'var(--tinta-3)', fontSize: 12 }}>{p.nombre}</span>
                              : <span style={{ color: 'var(--tinta-3)', fontSize: 12, fontStyle: 'italic' }}>sin apodo</span>}
                          </span>
                        </Link>
                      )}
                    </td>
                    <td>
                      {enEdicion ? (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <input value={editando.alias} style={{ width: 130 }}
                                 onChange={e => setEditando({ ...editando, alias: e.target.value })} />
                          <input value={editando.alternativos} placeholder="otras formas" style={{ width: 130 }}
                                 onChange={e => setEditando({ ...editando, alternativos: e.target.value })} />
                        </div>
                      ) : (
                        <>
                          <code style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{p.alias}</code>
                          {p.alias_alternativos?.length > 0 && (
                            <div style={{ color: 'var(--tinta-3)', fontSize: 12 }}>
                              también: {p.alias_alternativos.join(', ')}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {enEdicion
                        ? <input type="email" value={editando.email} style={{ width: 170 }}
                                 onChange={e => setEditando({ ...editando, email: e.target.value })} />
                        : (p.email || <span style={{ color: 'var(--tinta-3)' }}>sin correo</span>)}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <Actividad p={p} />
                    </td>
                    <td className="num" style={{ paddingRight: 20 }}><Dinero cents={p.saldo_cents} conSigno /></td>
                    <td style={{ fontSize: 12.5, paddingLeft: 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        {/* Los roles solo los mueve el dueño. La base lo
                            impone igual (0014); esto es para no ofrecer un
                            botón que va a dar error. */}
                        {p.is_owner ? (
                          <span className="etiqueta oro" title="El dueño reparte los permisos y nadie puede quitárselos">
                            Dueño
                          </span>
                        ) : (
                          <button onClick={() => alternar(p, 'is_admin')}
                                  disabled={!sesion.esDuenyo}
                                  title={sesion.esDuenyo
                                    ? 'Dar o quitar permisos de administrador'
                                    : 'Solo el dueño puede repartir permisos'}
                                  style={{ padding: '4px 9px' }}>
                            {p.is_admin ? 'Admin' : 'Jugador'}
                          </button>
                        )}
                        <button onClick={() => alternar(p, 'activo')}
                                title="Un participante inactivo no aparece para nuevas jornadas"
                                style={{ padding: '4px 9px' }}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </div>
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {enEdicion ? (
                        <>
                          <button onClick={() => guardar(p)} style={{ padding: '5px 9px' }} title="Guardar">
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditando(null)} style={{ padding: '5px 9px', marginLeft: 4 }} title="Cancelar">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button style={{ padding: '5px 9px' }}
                                  onClick={() => setEditando({
                                    id: p.id, nombre: p.nombre, apodo: p.apodo ?? '', alias: p.alias,
                                    email: p.email ?? '',
                                    alternativos: (p.alias_alternativos ?? []).join(', '),
                                  })}>
                            Editar
                          </button>
                          <button onClick={() => enlace(p)} style={{ padding: '5px 9px', marginLeft: 4 }}
                                  title="Enviarle su enlace de acceso por correo">
                            <Mail size={14} />
                          </button>
                          <button onClick={() => borrar(p)} style={{ padding: '5px 9px', marginLeft: 4 }}
                                  title="Borrar">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </Seccion>

      <Seccion titulo="Sobre el acceso">
        <p className="entradilla" style={{ marginTop: 12 }}>
          Se entra con un enlace que llega al correo. Quien quiera puede ponerse además
          una contraseña desde su propia pantalla de acceso, y si la olvida la restablece
          él mismo con «He olvidado mi contraseña» —a ti no te toca hacer nada—. Si
          alguien pierde el acceso del todo, pulsa el sobre de su fila y le llega un
          enlace nuevo.
        </p>
        <p className="entradilla">
          La cuenta se ata a su ficha sola en cuanto los correos coinciden, entre antes o
          después de darle de alta. Si alguien entra con un correo que no está en esta
          lista, aparecerá arriba en «Cuentas sin participante» para que decidas qué
          hacer con él.
        </p>
      </Seccion>
    </>
  )
}

/**
 * De un vistazo: si sigue entrando, cuánto juega y si le falta la columna de
 * la jornada abierta. `juega_abierta` es null cuando no hay ninguna abierta
 * (0016), y entonces no se dice nada en vez de marcar a todos en rojo.
 */
function Actividad({ p }) {
  const entrada = haceCuanto(p.ultima_entrada)
  return (
    <div style={{ display: 'grid', gap: 3, justifyItems: 'start' }}>
      <span title={p.ultima_entrada ? `Última entrada: ${fechaHora(p.ultima_entrada)}` : undefined}>
        {p.user_id
          ? (entrada ? `Entró ${entrada}` : 'Enlazada, sin entrar')
          : <span className="etiqueta">Sin cuenta</span>}
      </span>
      <span style={{ color: 'var(--tinta-3)' }}>
        {p.columnas ?? 0} columna{p.columnas === 1 ? '' : 's'}
        {p.ultima_columna && ` · la última el ${fechaCorta(p.ultima_columna)}`}
      </span>
      {p.activo && p.juega_abierta === true && <span className="etiqueta ok">Ya ha jugado</span>}
      {p.activo && p.juega_abierta === false && <span className="etiqueta falta">Falta su columna</span>}
    </div>
  )
}

/**
 * Una cuenta suelta y las dos salidas que tiene.
 *
 * Se pide el nombre en vez de sacarlo del correo: "jrodriguez@empresa.com" no
 * da un nombre presentable, y este nombre es el que va a salir en la
 * clasificación delante de toda la oficina.
 */
function FilaCuenta({ cuenta, candidatos, alDarDeAlta, alVincular }) {
  const [nombre, setNombre] = useState('')
  const [destino, setDestino] = useState('')

  return (
    <tr>
      <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{cuenta.email}</td>
      <td style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>{fechaCorta(cuenta.created_at)}</td>
      <td style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>
        {cuenta.last_sign_in_at ? fechaCorta(cuenta.last_sign_in_at) : '—'}
      </td>
      <td>
        <div style={{ display: 'grid', gap: 8, padding: '4px 0' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={nombre} placeholder="Nombre y apellido" style={{ width: 170 }}
                   onChange={e => setNombre(e.target.value)} />
            <button className="principal" disabled={!nombre.trim()}
                    style={{ padding: '6px 11px' }}
                    onClick={() => alDarDeAlta(cuenta, nombre)}>
              <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Dar de alta
            </button>
          </div>

          {candidatos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>o enlazar con</span>
              <select value={destino} onChange={e => setDestino(e.target.value)}
                      style={{ fontSize: 13, padding: '5px 8px' }}>
                <option value="">Elige a alguien…</option>
                {candidatos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <button disabled={!destino} style={{ padding: '6px 11px' }}
                      onClick={() => alVincular(cuenta, destino)}>
                Enlazar
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}
