import { lazy, Suspense } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Clasificacion from './pages/Clasificacion.jsx'
import Jornadas from './pages/Jornadas.jsx'
import Jornada from './pages/Jornada.jsx'
import Perfil from './pages/Perfil.jsx'
import Bote from './pages/Bote.jsx'
import Saldos from './pages/Saldos.jsx'
import Entrar from './pages/Entrar.jsx'
import { MODO_DEMO } from './lib/supabase.js'
import { useSesion, salir } from './lib/sesion.js'
import { Cargando } from './components/ui.jsx'

// El importador arrastra SheetJS, que pesa más que el resto de la app junta y
// solo lo usa el admin una vez por semana. Cargándolo aparte, la clasificación
// —que es lo que abre todo el mundo desde el móvil— no lo descarga nunca.
const Importar = lazy(() => import('./pages/admin/Importar.jsx'))

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
            <NavLink to="/admin/importar" className={({ isActive }) => (isActive ? 'activo' : '')}>
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
          <Route path="/admin/importar" element={
            verAdmin
              ? <Suspense fallback={<Cargando filas={4} />}><Importar /></Suspense>
              : <Navigate to="/entrar" replace />
          } />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="pie">
        <div className="pie-fila">
          <span>Mitad para quien más acierta · mitad al bote · el pleno se lo lleva todo</span>
          <span>Resultados oficiales de Loterías y Apuestas del Estado</span>
        </div>
      </footer>
    </div>
  )
}
