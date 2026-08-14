import { useEffect, useState } from 'react'
import { supabase, MODO_DEMO } from './supabase.js'

/**
 * Sesión del usuario y su ficha de jugador.
 *
 * `esAdmin` sirve solo para decidir qué se enseña. NO es una medida de
 * seguridad: quien manipule este valor en el navegador seguirá chocando con
 * las policies RLS, que son las que de verdad deciden quién escribe qué.
 */
export function useSesion() {
  const [estado, setEstado] = useState({
    cargando: !MODO_DEMO, user: null, jugador: null, esAdmin: false,
  })

  useEffect(() => {
    if (MODO_DEMO) return

    let vivo = true

    const cargarJugador = async (user) => {
      if (!user) return { user: null, jugador: null, esAdmin: false }
      const { data } = await supabase
        .from('players').select('*').eq('user_id', user.id).maybeSingle()
      return { user, jugador: data ?? null, esAdmin: !!data?.is_admin }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const r = await cargarJugador(data.session?.user ?? null)
      if (vivo) setEstado({ cargando: false, ...r })
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const r = await cargarJugador(session?.user ?? null)
      if (vivo) setEstado({ cargando: false, ...r })
    })

    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

  return estado
}

/** Magic link: sin contraseñas que gestionar ni que se puedan filtrar. */
export async function enviarEnlace(email) {
  if (MODO_DEMO) throw new Error('En modo demo no hay login.')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(error.message)
}

export async function salir() {
  if (!MODO_DEMO) await supabase.auth.signOut()
}
