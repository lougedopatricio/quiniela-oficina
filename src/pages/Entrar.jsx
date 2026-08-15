import { useState } from 'react'
import { enviarEnlace, entrarConPassword, pedirRestablecerPassword, establecerPassword, useSesion } from '../lib/sesion.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { Portada } from '../components/ui.jsx'

export default function Entrar() {
  const sesion = useSesion()

  if (MODO_DEMO) {
    return (
      <div style={{ maxWidth: 460 }}>
        <Portada antetitulo="Acceso" titular="Entra con tu correo" />
        <div className="aviso" style={{ marginTop: 24 }}>
          <strong>Edición de muestra.</strong> No hay acceso porque no hay base conectada.
          La clasificación, las jornadas y el bote se ven igual sin entrar.
        </div>
      </div>
    )
  }

  // Ya ha entrado: aquí se gestiona la contraseña, no se vuelve a pedir acceso.
  if (sesion.user) return <GestionPassword email={sesion.user.email} />

  return <FormularioAcceso />
}

function FormularioAcceso() {
  const [modo, setModo] = useState('enlace')   // 'enlace' | 'password'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [estado, setEstado] = useState(null)

  async function conEnlace(e) {
    e.preventDefault()
    setEstado({ tipo: 'trabajando', txt: 'Enviando…' })
    try {
      await enviarEnlace(email.trim())
      setEstado({ tipo: 'ok', txt: `Enlace enviado a ${email}. Ábrelo desde este mismo dispositivo.` })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  async function conPassword(e) {
    e.preventDefault()
    setEstado({ tipo: 'trabajando', txt: 'Entrando…' })
    try {
      await entrarConPassword(email.trim(), password)
      // No hace falta redirigir a mano: useSesion() se entera sola del
      // cambio de sesión y App.jsx deja de mostrar esta pantalla.
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  async function olvidoPassword() {
    if (!email.trim()) {
      return setEstado({ tipo: 'error', txt: 'Escribe primero tu correo, arriba.' })
    }
    setEstado({ tipo: 'trabajando', txt: 'Enviando…' })
    try {
      await pedirRestablecerPassword(email.trim())
      setEstado({ tipo: 'ok', txt: `Te hemos enviado un enlace a ${email} para elegir una contraseña nueva.` })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Portada
        antetitulo="Acceso"
        titular="Entra en la quiniela"
        entradilla="Con un enlace al correo, o con contraseña si ya te has puesto una."
      />

      <div style={{ display: 'flex', gap: 4, marginTop: 22, marginBottom: 18 }}>
        <button onClick={() => { setModo('enlace'); setEstado(null) }}
                className={modo === 'enlace' ? 'principal' : undefined}
                style={{ flex: 1 }}>
          Enlace al correo
        </button>
        <button onClick={() => { setModo('password'); setEstado(null) }}
                className={modo === 'password' ? 'principal' : undefined}
                style={{ flex: 1 }}>
          Contraseña
        </button>
      </div>

      {modo === 'enlace' ? (
        <form onSubmit={conEnlace} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Tu correo</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                   placeholder="nombre@empresa.com" autoComplete="email" />
          </label>
          <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}
                  style={{ justifySelf: 'start' }}>
            Enviarme el enlace
          </button>
        </form>
      ) : (
        <form onSubmit={conPassword} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Tu correo</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                   placeholder="nombre@empresa.com" autoComplete="email" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Contraseña</span>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                   autoComplete="current-password" />
          </label>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}>
              Entrar
            </button>
            <button type="button" onClick={olvidoPassword}
                    style={{ border: 'none', padding: 0, textDecoration: 'underline', fontSize: 12.5 }}>
              He olvidado mi contraseña
            </button>
          </div>
          <p style={{ color: 'var(--tinta-3)', fontSize: 12.5, margin: 0 }}>
            ¿Todavía no te has puesto una? Entra con el enlace al correo y podrás
            añadirla desde ahí.
          </p>
        </form>
      )}

      {estado && <div className="aviso" style={{ marginTop: 18 }}>{estado.txt}</div>}
    </div>
  )
}

/** Para quien ya ha entrado: poner o cambiar su contraseña, no volver a pedir acceso. */
function GestionPassword({ email }) {
  const [password, setPassword] = useState('')
  const [repite, setRepite] = useState('')
  const [estado, setEstado] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    if (password.length < 6) {
      return setEstado({ tipo: 'error', txt: 'La contraseña tiene que tener al menos 6 caracteres.' })
    }
    if (password !== repite) {
      return setEstado({ tipo: 'error', txt: 'Las dos contraseñas no coinciden.' })
    }
    setEstado({ tipo: 'trabajando', txt: 'Guardando…' })
    try {
      await establecerPassword(password)
      setPassword(''); setRepite('')
      setEstado({ tipo: 'ok', txt: 'Contraseña guardada. Ya puedes usarla para entrar la próxima vez.' })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Portada
        antetitulo="Acceso"
        titular="Tu contraseña"
        entradilla={`Sesión iniciada como ${email}. Esto es opcional: el enlace al correo seguirá funcionando siempre, sin ponerla.`}
      />
      <form onSubmit={guardar} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="rotulo">Contraseña nueva</span>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                 autoComplete="new-password" minLength={6} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="rotulo">Repítela</span>
          <input type="password" required value={repite} onChange={e => setRepite(e.target.value)}
                 autoComplete="new-password" minLength={6} />
        </label>
        <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}
                style={{ justifySelf: 'start' }}>
          Guardar contraseña
        </button>
      </form>
      {estado && <div className="aviso" style={{ marginTop: 18 }}>{estado.txt}</div>}
    </div>
  )
}
