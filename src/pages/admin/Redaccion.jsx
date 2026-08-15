import { NavLink, Outlet } from 'react-router-dom'

const APARTADOS = [
  { a: '/admin/participantes', txt: 'Participantes' },
  { a: '/admin/jornadas',      txt: 'Jornadas' },
  { a: '/admin/boletos',       txt: 'Boletos' },
  { a: '/admin/caja',          txt: 'Caja' },
  { a: '/admin/importar',      txt: 'Importar Excel' },
]

/**
 * Marco común del área de administración.
 *
 * La subnavegación se separa de la principal a propósito: son dos planos
 * distintos, el público y el de trastienda, y mezclarlos haría que el menú de
 * arriba creciera hasta ser inmanejable en el móvil.
 */
export default function Redaccion() {
  return (
    <>
      <nav style={{
        display: 'flex', gap: 20, overflowX: 'auto',
        borderBottom: '1px solid var(--regla)', marginBottom: 24, paddingBottom: 0,
      }}>
        {APARTADOS.map(s => (
          <NavLink key={s.a} to={s.a}
                   style={({ isActive }) => ({
                     padding: '8px 0', whiteSpace: 'nowrap',
                     fontSize: 12.5, fontWeight: 600, letterSpacing: '.04em',
                     textTransform: 'uppercase',
                     color: isActive ? 'var(--rojo)' : 'var(--tinta-2)',
                     borderBottom: `2px solid ${isActive ? 'var(--rojo)' : 'transparent'}`,
                     marginBottom: -1,
                   })}>
            {s.txt}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
