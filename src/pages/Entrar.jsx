import { useState } from 'react'
import { Mail } from 'lucide-react'
import { enviarEnlace } from '../lib/sesion.js'
import { MODO_DEMO } from '../lib/supabase.js'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState(null)

  async function enviar(e) {
    e.preventDefault()
    setEstado({ tipo: 'trabajando', txt: 'Enviando…' })
    try {
      await enviarEnlace(email.trim())
      setEstado({ tipo: 'ok', txt: `Te hemos enviado un enlace a ${email}. Ábrelo desde este mismo dispositivo.` })
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <div className="encabezado-seccion">
        <div>
          <h1>Entrar</h1>
          <p>Sin contraseñas: te llega un enlace al correo y con eso entras.</p>
        </div>
      </div>

      {MODO_DEMO ? (
        <div className="aviso">
          <strong>Modo demo.</strong> No hay login porque no hay ninguna base conectada.
          La clasificación, las jornadas y el bote se ven igualmente sin entrar.
        </div>
      ) : (
        <form className="tarjeta" onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: '.85rem', color: 'var(--texto-suave)' }}>Tu correo</span>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                   placeholder="nombre@empresa.com" autoComplete="email" />
          </label>
          <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}>
            <Mail size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
            Enviarme el enlace
          </button>
          {estado && <div className="aviso">{estado.txt}</div>}
        </form>
      )}
    </div>
  )
}
