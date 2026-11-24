import { useState } from 'react'
import { KeyRound, Copy, Check, UserPlus, Shuffle } from 'lucide-react'
import {
  getCuentas, getParticipantes, cambiarContrasenaDe, enlazarCuentaConPerfil, crearCuentaDesdeAdmin,
} from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio } from '../../components/ui.jsx'
import { fechaCorta, haceCuanto, nombreVisible } from '../../lib/formato.js'
import { useSesion } from '../../lib/sesion.js'
import { MODO_DEMO } from '../../lib/supabase.js'
import { avisarCuentasCambiadas } from '../../lib/avisos.js'

// ---------------------------------------------------------------------------
// Las cuentas de acceso, sin SQL (0030).
//
// Una cuenta es con lo que alguien entra (correo y contraseña); un perfil es
// su ficha en la quiniela (nombre, columnas, caja). Aquí se ven todas las
// cuentas, se unen con su perfil, se les pone contraseña y se crean nuevas.
// Nada de esto manda correos.
// ---------------------------------------------------------------------------

const FILTROS = [
  { id: 'todas', txt: 'Todas', pasa: () => true },
  { id: 'sin-perfil', txt: 'Sin perfil', pasa: c => !c.player_id },
  { id: 'sin-entrar', txt: 'Nunca han entrado', pasa: c => !c.last_sign_in_at },
  { id: 'sin-contrasena', txt: 'Sin contraseña', pasa: c => !c.con_contrasena },
]

// Fácil de dictar o de pasar por el chat, y distinta cada vez. Que la cambien
// al entrar si quieren.
const PALABRAS = ['Pleno', 'Bote', 'Quiniela', 'Golazo', 'Penalti', 'Corner', 'Remontada', 'Larguero', 'Chilena', 'Derbi']
export function contrasenaNueva() {
  const n = new Uint32Array(2)
  crypto.getRandomValues(n)
  return `${PALABRAS[n[0] % PALABRAS.length]}${String(1000 + (n[1] % 9000))}`
}

export default function Cuentas() {
  const sesion = useSesion()
  const [recarga, setRecarga] = useState(0)
  const [filtro, setFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState(null)
  const [contrasenaDe, setContrasenaDe] = useState(null)   // user_id con el editor abierto

  const cuentas = useAsync(getCuentas, [recarga])
  const perfiles = useAsync(getParticipantes, [recarga])

  if ((cuentas.cargando && !cuentas.datos) || (perfiles.cargando && !perfiles.datos)) return <Cargando filas={6} />
  if (cuentas.error) return <AvisoError error={cuentas.error} />
  if (perfiles.error) return <AvisoError error={perfiles.error} />

  const refrescar = () => { setRecarga(n => n + 1); avisarCuentasCambiadas() }
  const lista = cuentas.datos ?? []
  const fichas = [...(perfiles.datos ?? [])].sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'))
  const f = FILTROS.find(x => x.id === filtro) ?? FILTROS[0]
  const t = busca.trim().toLowerCase()
  const visibles = lista.filter(f.pasa).filter(c => !t || [c.email, c.player_nombre, c.player_alias, c.player_apodo]
    .some(v => String(v ?? '').toLowerCase().includes(t)))

  async function unir(cuenta, playerId) {
    const destino = fichas.find(p => p.id === playerId)
    if (destino?.user_id && destino.user_id !== cuenta.user_id &&
        !window.confirm(`${nombreVisible(destino)} ya tiene otra cuenta. Si sigues, esa otra cuenta se queda sin perfil. ¿Sigues?`)) return
    if (!playerId && !window.confirm(`¿Soltar ${cuenta.email} de ${cuenta.player_apodo || cuenta.player_nombre}? Podrá entrar, pero no jugará hasta que la vuelvas a unir.`)) return
    setAviso({ txt: 'Guardando…' })
    try {
      await enlazarCuentaConPerfil(cuenta.user_id, playerId || null)
      setAviso({ tipo: 'ok', txt: playerId ? `${cuenta.email} unida a ${nombreVisible(destino)}. Que recargue la web para verlo.` : `${cuenta.email} se ha quedado sin perfil.` })
      refrescar()
    } catch (e) { setAviso({ tipo: 'error', txt: e.message }) }
  }

  const conteo = (id) => lista.filter((FILTROS.find(x => x.id === id)).pasa).length

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Las cuentas"
        entradilla="Con lo que cada uno entra en la web. Aquí las unes con su perfil, les pones contraseña o creas una nueva, sin tocar Supabase y sin que se mande ningún correo."
      />

      {aviso && <div className="aviso" style={{ marginTop: 20 }} role="status">{aviso.txt}</div>}

      <CrearCuenta fichas={fichas} alCrear={(txt) => { setAviso({ tipo: 'ok', txt }); refrescar() }} />

      <Seccion titulo="Todas las cuentas" nota={`${lista.length} en total`}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '14px 0' }}>
          <div className="pestanas-mini" role="tablist">
            {FILTROS.map(x => (
              <button key={x.id} type="button" role="tab" aria-selected={filtro === x.id}
                      className={filtro === x.id ? 'activo' : ''} onClick={() => setFiltro(x.id)}>
                {x.txt} · {conteo(x.id)}
              </button>
            ))}
          </div>
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
                 placeholder="Buscar por correo o nombre" style={{ flex: '1 1 220px', maxWidth: 320 }} />
        </div>

        {visibles.length === 0 ? <Vacio>No hay ninguna cuenta así.</Vacio> : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th style={{ minWidth: 200 }}>Perfil</th>
                  <th>Acceso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(c => {
                  // Las de administrador solo las toca el dueño (0030); la
                  // propia, siempre.
                  const bloqueada = c.player_con_permisos && !sesion.esDuenyo && !MODO_DEMO && c.user_id !== sesion.user?.id
                  return (
                    <FilaCuenta key={c.user_id} c={c} fichas={fichas} bloqueada={bloqueada}
                                abierta={contrasenaDe === c.user_id}
                                alAbrir={() => setContrasenaDe(contrasenaDe === c.user_id ? null : c.user_id)}
                                alUnir={(pid) => unir(c, pid)}
                                alCambiar={(txt) => { setAviso({ tipo: 'ok', txt }); setRecarga(n => n + 1) }} />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Cómo funciona">
        <p className="entradilla" style={{ marginTop: 12 }}>
          Cada cuenta va unida a un perfil como mucho, y cada perfil a una cuenta. Si
          unes una cuenta a un perfil que ya tenía otra, la otra se queda suelta (y te
          saldrá en el aviso de cuentas sin participante). El perfil se queda con el
          correo de la cuenta.
        </p>
        <p className="entradilla">
          Al cambiar una contraseña, la cuenta queda además confirmada y desbloqueada.
          Pásale la contraseña en privado; puede cambiarla en «Mi expediente». Las
          cuentas de los administradores solo las puede tocar el dueño.
        </p>
      </Seccion>
    </>
  )
}

function FilaCuenta({ c, fichas, bloqueada, abierta, alAbrir, alUnir, alCambiar }) {
  const entrada = haceCuanto(c.last_sign_in_at)
  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{c.email}</div>
          <div style={{ fontSize: 12, color: 'var(--tinta-3)' }}>Creada el {fechaCorta(c.created_at)}</div>
        </td>
        <td>
          <select value={c.player_id ?? ''} disabled={bloqueada || MODO_DEMO}
                  onChange={e => alUnir(e.target.value || null)}
                  aria-label={`Perfil de ${c.email}`}
                  style={{ width: '100%', borderColor: c.player_id ? undefined : 'var(--rojo)' }}>
            <option value="">— Sin perfil —</option>
            {fichas.map(p => (
              <option key={p.id} value={p.id}>
                {nombreVisible(p)}{p.apodo ? ` (${p.nombre})` : ''}{p.user_id && p.user_id !== c.user_id ? ' · ya tiene cuenta' : ''}
              </option>
            ))}
          </select>
          {bloqueada && <div style={{ fontSize: 11.5, color: 'var(--tinta-3)', marginTop: 3 }}>Administrador: solo el dueño la cambia</div>}
        </td>
        <td style={{ fontSize: 12.5 }}>
          <div>{entrada ? `Entró ${entrada}` : <span style={{ color: 'var(--tinta-3)' }}>Nunca ha entrado</span>}</div>
          <div style={{ color: 'var(--tinta-3)' }}>
            {c.con_contrasena ? 'Con contraseña' : 'Sin contraseña (enlace)'}{c.confirmada ? '' : ' · sin confirmar'}
          </div>
        </td>
        <td className="num">
          <button type="button" onClick={alAbrir} disabled={bloqueada}
                  className={abierta ? 'principal' : undefined}
                  title="Ponerle una contraseña nueva" style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
            <KeyRound size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Contraseña
          </button>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={4} style={{ background: 'var(--papel-2)' }}>
            <EditorContrasena cuenta={c} alCambiar={alCambiar} />
          </td>
        </tr>
      )}
    </>
  )
}

function EditorContrasena({ cuenta, alCambiar }) {
  const [password, setPassword] = useState(contrasenaNueva)
  const [estado, setEstado] = useState(null)
  const [copiada, setCopiada] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (password.length < 6) return setEstado({ txt: 'Tiene que tener al menos 6 caracteres.' })
    setEstado({ txt: 'Guardando…', trabajando: true })
    try {
      await cambiarContrasenaDe(cuenta.user_id, password)
      setEstado({ hecho: true, txt: `Hecho. ${cuenta.email} ya puede entrar con «${password}».` })
      alCambiar(`Contraseña cambiada para ${cuenta.email}.`)
    } catch (err) { setEstado({ txt: err.message }) }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Correo: ${cuenta.email}\nContraseña: ${password}`)
      setCopiada(true); setTimeout(() => setCopiada(false), 2000)
    } catch { /* sin portapapeles: está a la vista para copiarla a mano */ }
  }

  return (
    <form onSubmit={guardar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0' }}>
      <span className="rotulo">Nueva contraseña</span>
      <input value={password} onChange={e => { setPassword(e.target.value); setEstado(null) }}
             minLength={6} autoComplete="off" spellCheck={false}
             style={{ fontFamily: 'var(--mono)', width: 180 }} aria-label="Nueva contraseña" />
      <button type="button" onClick={() => { setPassword(contrasenaNueva()); setEstado(null) }} title="Otra al azar" style={{ padding: '5px 10px' }}>
        <Shuffle size={14} style={{ verticalAlign: -2 }} />
      </button>
      <button className="principal" type="submit" disabled={estado?.trabajando || MODO_DEMO} style={{ padding: '5px 12px' }}>
        Guardar
      </button>
      {estado?.hecho && (
        <button type="button" onClick={copiar} style={{ padding: '5px 10px' }}>
          {copiada ? <><Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Copiado</>
            : <><Copy size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Copiar correo y contraseña</>}
        </button>
      )}
      {estado && <span style={{ fontSize: 12.5, flexBasis: '100%' }}>{estado.txt}</span>}
      {MODO_DEMO && <span style={{ fontSize: 12.5, flexBasis: '100%', color: 'var(--tinta-3)' }}>En la edición de muestra no se guarda nada.</span>}
    </form>
  )
}

function CrearCuenta({ fichas, alCrear }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(contrasenaNueva)
  const [playerId, setPlayerId] = useState('')
  const [estado, setEstado] = useState(null)
  const [hecha, setHecha] = useState(null)
  const [copiada, setCopiada] = useState(false)
  const sinCuenta = fichas.filter(p => !p.user_id)

  // Elegir un perfil que ya tenga el correo apuntado lo rellena solo.
  function elegirPerfil(id) {
    setPlayerId(id)
    const p = fichas.find(x => x.id === id)
    if (p?.email && !email.trim()) setEmail(p.email)
  }

  async function crear(e) {
    e.preventDefault()
    if (password.length < 6) return setEstado({ txt: 'La contraseña tiene que tener al menos 6 caracteres.' })
    setEstado({ txt: 'Creando…', trabajando: true })
    try {
      await crearCuentaDesdeAdmin({ email: email.trim(), password, playerId: playerId || null })
      const p = fichas.find(x => x.id === playerId)
      setHecha({ email: email.trim().toLowerCase(), password })
      setEstado(null)
      alCrear(`Cuenta creada para ${email.trim()}${p ? ` y unida a ${nombreVisible(p)}` : ''}. Ya puede entrar con su contraseña.`)
      setEmail(''); setPlayerId(''); setPassword(contrasenaNueva())
    } catch (err) { setEstado({ txt: err.message }) }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Correo: ${hecha.email}\nContraseña: ${hecha.password}`)
      setCopiada(true); setTimeout(() => setCopiada(false), 2000)
    } catch { /* se ve en pantalla */ }
  }

  return (
    <Seccion titulo="Crear una cuenta" entradilla="Para quien no consigue registrarse: la creas tú, ya lista para entrar, y le pasas la contraseña.">
      <form onSubmit={crear} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', alignItems: 'end', padding: '14px 0' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="rotulo">Perfil (opcional)</span>
          <select value={playerId} onChange={e => elegirPerfil(e.target.value)}>
            <option value="">— Sin perfil por ahora —</option>
            {sinCuenta.map(p => <option key={p.id} value={p.id}>{nombreVisible(p)}{p.apodo ? ` (${p.nombre})` : ''}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="rotulo">Correo</span>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="rotulo">Contraseña</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <input value={password} onChange={e => setPassword(e.target.value)} minLength={6} required
                   autoComplete="off" spellCheck={false} style={{ fontFamily: 'var(--mono)', flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => setPassword(contrasenaNueva())} title="Otra al azar" style={{ padding: '5px 10px' }}>
              <Shuffle size={14} style={{ verticalAlign: -2 }} />
            </button>
          </span>
        </label>
        <button className="principal" type="submit" disabled={estado?.trabajando || MODO_DEMO} style={{ justifySelf: 'start' }}>
          <UserPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Crear cuenta
        </button>
      </form>
      {estado && <div className="aviso" style={{ marginBottom: 12 }}>{estado.txt}</div>}
      {hecha && (
        <div className="aviso" style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Pásale esto en privado: <strong>{hecha.email}</strong> · <code>{hecha.password}</code></span>
          <button type="button" onClick={copiar} style={{ padding: '4px 10px' }}>
            {copiada ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
      {MODO_DEMO && <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', marginBottom: 12 }}>En la edición de muestra no se crea nada.</p>}
    </Seccion>
  )
}
