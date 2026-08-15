import { useState } from 'react'
import { enviarEnlace } from '../lib/sesion.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { Portada } from '../components/ui.jsx'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState(null)

  async function enviar(e) {
    e.preventDefault()
    setEstado({ tipo: 'trabajando', txt: 'Enviando…' })
    try {
      await enviarEnlace(email.trim())
      setEstado({ tipo: 'ok', txt: `Enlace enviado a ${email}. Ábrelo desde este mismo dispositivo.` })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Portada
        antetitulo="Acceso"
        titular="Entra con tu correo"
        entradilla="Sin contraseñas que recordar ni que se puedan filtrar: te llega un enlace al correo y con eso entras."
      />

      {MODO_DEMO ? (
        <div className="aviso" style={{ marginTop: 24 }}>
          <strong>Edición de muestra.</strong> No hay acceso porque no hay base conectada.
          La clasificación, las jornadas y el bote se ven igual sin entrar.
        </div>
      ) : (
        <form onSubmit={enviar} style={{ display: 'grid', gap: 14, marginTop: 24 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Tu correo</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                   placeholder="nombre@empresa.com" autoComplete="email" />
          </label>
          <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}
                  style={{ justifySelf: 'start' }}>
            Enviarme el enlace
          </button>
          {estado && <div className="aviso">{estado.txt}</div>}
        </form>
      )}
    </div>
  )
}
