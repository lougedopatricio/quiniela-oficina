import { lazy, Suspense, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Clasificacion from './pages/Clasificacion.jsx'
import Jornadas from './pages/Jornadas.jsx'
import Jornada from './pages/Jornada.jsx'
import Perfil from './pages/Perfil.jsx'
import Bote from './pages/Bote.jsx'
import Saldos from './pages/Saldos.jsx'
import Entrar from './pages/Entrar.jsx'
import { MODO_DEMO } from './lib/supabase.js'
import { useSesion, salir, establecerPassword } from './lib/sesion.js'
import { Cargando } from './components/ui.jsx'

// Toda la trastienda se carga aparte. El importador arrastra SheetJS, que pesa
// más que el resto de la app junta, y el panel entero solo lo abre el
// administrador: la clasificación, que es lo que mira todo el mundo desde el
// móvil, no descarga nada de esto.
const Redaccion     = lazy(() => import('./pages/admin/Redaccion.jsx'))
const Participantes = lazy(() => import('./pages/admin/Participantes.jsx'))
const JornadasAdmin = lazy(() => import('./pages/admin/JornadasAdmin.jsx'))
const BoletosAdmin  = lazy(() => import('./pages/admin/Boletos.jsx'))
const Caja          = lazy(() => import('./pages/admin/Caja.jsx'))
const Importar      = lazy(() => import('./pages/admin/Importar.jsx'))

const SECCIONES = [
  { a: '/',         txt: 'Portada' },
  { a: '/jornadas', txt: 'Jornadas' },
  { a: '/bote',     txt: 'El bote' },
  { a: '/saldos',   txt: 'Caja' },
  { a: '/perfil',   txt: 'Mi expediente' },
]

const hoy = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date())

export default function App() {
  const sesion = useSesion()
  // En demo se enseña el importador para poder probar la validación del Excel;
  // con base real, solo al admin. Esto decide qué se ve, no qué se puede hacer:
  // quien fuerce la ruta chocará igual con las policies RLS.
  const verAdmin = MODO_DEMO || sesion.esAdmin

  // Al pulsar "he olvidado mi contraseña" desde el correo, Supabase crea la
  // sesión sola y avisa con este evento. Se tapa toda la app hasta que se
  // establece la nueva, en vez de intentar llevar a una ruta concreta: el
  // enlace de recuperación usa el fragmento de la URL para sus propios
  // tokens, el mismo sitio que HashRouter usa para las rutas, y forzar una
  // convivencia entre los dos es más frágil que evitarla del todo.
  if (sesion.recuperando) return <PantallaRecuperacion />

  return (
    <div className="app">
      <header className="mancheta">
        <div className="mancheta-fila">
          <NavLink to="/" className="logotipo">
            <b>La Quiniela</b> <span>de la Oficina</span>
          </NavLink>
          <div className="fecha-cabecera" style={{ marginLeft: 'auto' }}>{hoy}</div>
          {!MODO_DEMO && (
            sesion.user
              ? <button onClick={salir} title={sesion.user.email}>Salir</button>
              : <NavLink to="/entrar" className="boton">Entrar</NavLink>
          )}
        </div>
      </header>

      <nav className="secciones">
        <div className="secciones-fila">
          {SECCIONES.map(s => (
            <NavLink key={s.a} to={s.a} end={s.a === '/'}
                     className={({ isActive }) => (isActive ? 'activo' : '')}>
              {s.txt}
            </NavLink>
          ))}
          {verAdmin && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'activo' : '')}>
              Redacción
            </NavLink>
          )}
        </div>
      </nav>

      <main className="contenido">
        {MODO_DEMO && (
          <div className="aviso" style={{ marginBottom: 24 }}>
            <strong>Edición de muestra.</strong> Los nombres y los resultados son inventados,
            pero el dinero está repartido con las reglas de verdad.
          </div>
        )}

        <Routes>
          <Route path="/"               element={<Clasificacion />} />
          <Route path="/jornadas"       element={<Jornadas />} />
          <Route path="/jornada/:id"    element={<Jornada />} />
          <Route path="/bote"           element={<Bote />} />
          <Route path="/saldos"         element={<Saldos />} />
          <Route path="/perfil"         element={<Perfil />} />
          <Route path="/perfil/:id"     element={<Perfil />} />
          <Route path="/entrar"         element={<Entrar />} />
          <Route path="/admin" element={
            verAdmin
              ? <Suspense fallback={<Cargando filas={4} />}><Redaccion /></Suspense>
              : <Navigate to="/entrar" replace />
          }>
            <Route index element={<Navigate to="/admin/participantes" replace />} />
            <Route path="participantes" element={<Participantes />} />
            <Route path="jornadas"      element={<JornadasAdmin />} />
            <Route path="boletos"       element={<BoletosAdmin />} />
            <Route path="caja"          element={<Caja />} />
            <Route path="importar"      element={<Importar />} />
          </Route>
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="pie">
        <div className="pie-fila">
          <span>Resultados oficiales de Loterías y Apuestas del Estado</span>
        </div>
      </footer>
    </div>
  )
}

/** Se muestra sola, tapando toda la app, tras pulsar el enlace de recuperación. */
function PantallaRecuperacion() {
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
      // Recarga limpia: vuelve a arrancar la sesión desde cero, ya sin la
      // bandera de recuperación, y con la contraseña nueva ya funcionando.
      window.location.href = window.location.origin + window.location.pathname
    } catch (err) {
      setEstado({ tipo: 'error', txt: err.message })
    }
  }

  return (
    <div className="app">
      <main className="contenido" style={{ maxWidth: 460 }}>
        <div className="titular" style={{ marginTop: 40 }}>Elige tu nueva contraseña</div>
        <p className="entradilla">Después de guardarla, entra con ella normalmente.</p>
        <form onSubmit={guardar} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Contraseña nueva</span>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                   autoComplete="new-password" minLength={6} autoFocus />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="rotulo">Repítela</span>
            <input type="password" required value={repite} onChange={e => setRepite(e.target.value)}
                   autoComplete="new-password" minLength={6} />
          </label>
          <button className="principal" type="submit" disabled={estado?.tipo === 'trabajando'}
                  style={{ justifySelf: 'start' }}>
            Guardar y entrar
          </button>
        </form>
        {estado && <div className="aviso" style={{ marginTop: 18 }}>{estado.txt}</div>}
      </main>
    </div>
  )
}
