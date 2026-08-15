import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Trash2, Plus, Check, X } from 'lucide-react'
import {
  getParticipantes, crearParticipante, actualizarParticipante,
  borrarParticipante, enviarEnlaceAcceso,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Persona, Dinero } from '../../components/ui.jsx'

const VACIO = { nombre: '', alias: '', email: '', alternativos: '' }

export default function Participantes() {
  const [recarga, setRecarga] = useState(0)
  const [nuevo, setNuevo] = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [aviso, setAviso] = useState(null)

  const { cargando, error, datos } = useAsync(getParticipantes, [recarga])

  if (cargando) return <Cargando filas={5} />
  if (error) return <AvisoError error={error} />

  const refrescar = () => setRecarga(n => n + 1)
  const fallo = (e) => setAviso({ tipo: 'error', txt: e.message })

  async function anadir(e) {
    e.preventDefault()
    try {
      await crearParticipante({
        nombre: nuevo.nombre.trim(),
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

  const sinVincular = datos.filter(p => !p.user_id).length

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Quién juega la quiniela"
        entradilla="El alias es lo que el importador busca en la primera columna del Excel. Si alguien aparece escrito de varias formas, añádelas como alias alternativos y dejará de dar problemas."
      />

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

      <Seccion titulo="La plantilla"
               nota={sinVincular ? `${sinVincular} sin cuenta enlazada` : 'Todos con cuenta'}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Participante</th>
                <th>Alias en el Excel</th>
                <th>Correo</th>
                <th>Cuenta</th>
                <th className="num">Saldo</th>
                <th>Permisos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.map(p => {
                const enEdicion = editando?.id === p.id
                return (
                  <tr key={p.id} style={p.activo ? undefined : { opacity: .5 }}>
                    <td>
                      {enEdicion
                        ? <input value={editando.nombre} style={{ width: 140 }}
                                 onChange={e => setEditando({ ...editando, nombre: e.target.value })} />
                        : <Link to={`/perfil/${p.id}`}><Persona nombre={p.nombre} /></Link>}
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
                    <td>
                      <span className={`etiqueta ${p.user_id ? 'ok' : ''}`}>
                        {p.user_id ? 'Enlazada' : 'Sin entrar'}
                      </span>
                    </td>
                    <td className="num"><Dinero cents={p.saldo_cents} conSigno /></td>
                    <td style={{ fontSize: 12.5 }}>
                      <button onClick={() => alternar(p, 'is_admin')}
                              title="Dar o quitar permisos de administrador"
                              style={{ padding: '4px 9px', marginRight: 5 }}>
                        {p.is_admin ? 'Admin' : 'Jugador'}
                      </button>
                      <button onClick={() => alternar(p, 'activo')}
                              title="Un participante inactivo no aparece para nuevas jornadas"
                              style={{ padding: '4px 9px' }}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </button>
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
                                    id: p.id, nombre: p.nombre, alias: p.alias,
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
      </Seccion>

      <Seccion titulo="Sobre el acceso">
        <p className="entradilla" style={{ marginTop: 12 }}>
          No hay contraseñas: se entra con un enlace que llega al correo, así que no hay
          nada que restablecer. Si alguien pierde el acceso, pulsa el sobre de su fila y
          le llega uno nuevo. La cuenta se ata a su ficha automáticamente la primera vez
          que entra, siempre que el correo coincida con el que tenga aquí.
        </p>
      </Seccion>
    </>
  )
}
