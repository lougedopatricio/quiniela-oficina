import { lazy, Suspense } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Trophy, Ticket, PiggyBank, Wallet, User } from 'lucide-react'
import { MODO_DEMO } from './lib/supabase.js'
import { Cargando } from './components/ui.jsx'
import Clasificacion from './pages/Clasificacion.jsx'
import Jornadas from './pages/Jornadas.jsx'
import Jornada from './pages/Jornada.jsx'
import Perfil from './pages/Perfil.jsx'
import Bote from './pages/Bote.jsx'
import Saldos from './pages/Saldos.jsx'
import Entrar from './pages/Entrar.jsx'
import { useSesion, salir } from './lib/sesion.js'

// El importador arrastra SheetJS, que pesa más que el resto de la app junta y
// solo lo usa el admin una vez por semana. Cargándolo aparte, la clasificación
// —que es lo que abre todo el mundo desde el móvil— no lo descarga nunca.
const Importar = lazy(() => import('./pages/admin/Importar.jsx'))

const ENLACES = [
  { a: '/',           txt: 'Clasificación' },
  { a: '/jornadas',   txt: 'Jornadas' },
  { a: '/bote',       txt: 'Bote' },
  { a: '/saldos',     txt: 'Saldos' },
  { a: '/perfil',     txt: 'Mi perfil' },
]

export default function App() {
  const sesion = useSesion()
  // En demo se enseña el importador para poder probar la validación del Excel;
  // con base real, solo al admin. Esto decide qué se ve, no qué se puede hacer:
  // quien fuerce la ruta chocará igual con las policies RLS.
  const verAdmin = MODO_DEMO || sesion.esAdmin

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-fila">
          <NavLink to="/" className="marca">
            <Trophy size={20} strokeWidth={2.4} />
            <span>La Quiniela</span>
          </NavLink>
          <nav className="nav">
            {ENLACES.map(e => (
              <NavLink key={e.a} to={e.a} end={e.a === '/'}
                       className={({ isActive }) => (isActive ? 'activo' : '')}>
                {e.txt}
              </NavLink>
            ))}
            {verAdmin && (
              <NavLink to="/admin/importar" className={({ isActive }) => (isActive ? 'activo' : '')}>
                Importar
              </NavLink>
            )}
          </nav>

          <div style={{ marginLeft: 'auto', flex: 'none' }}>
            {MODO_DEMO ? null : sesion.user ? (
              <button onClick={salir} title={sesion.user.email}>Salir</button>
            ) : (
              <NavLink to="/entrar" className="boton">Entrar</NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="contenido">
        {MODO_DEMO && (
          <div className="aviso" style={{ marginBottom: 18 }}>
            <strong>Modo demo.</strong> Estos datos son inventados, pero salen de aplicar
            las reglas de reparto de verdad. Configura <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> para conectar la base real.
          </div>
        )}

        <Routes>
          <Route path="/"             element={<Clasificacion />} />
          <Route path="/jornadas"     element={<Jornadas />} />
          <Route path="/jornada/:id"  element={<Jornada />} />
          <Route path="/bote"         element={<Bote />} />
          <Route path="/saldos"       element={<Saldos />} />
          <Route path="/perfil"       element={<Perfil />} />
          <Route path="/perfil/:id"   element={<Perfil />} />
          <Route path="/entrar"       element={<Entrar />} />
          <Route path="/admin/importar" element={
            verAdmin
              ? <Suspense fallback={<Cargando filas={4} />}><Importar /></Suspense>
              : <Navigate to="/entrar" replace />
          } />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="pie">
        Quiniela de la oficina · mitad al que más acierta, mitad al bote · pleno de 14 se lleva el bote
      </footer>
    </div>
  )
}
