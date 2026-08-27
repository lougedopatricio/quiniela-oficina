import { useEffect, useState } from 'react'
import { supabase, MODO_DEMO } from './supabase.js'

/**
 * Supabase entrega sus tokens en el FRAGMENTO de la URL
 * (`#access_token=…&type=recovery`), que es el mismo sitio donde HashRouter
 * guarda la ruta. Si no se limpia, se queda ahí para siempre: cada recarga
 * vuelve a verlo, Supabase vuelve a emitir PASSWORD_RECOVERY y la app vuelve a
 * taparse con la pantalla de contraseña nueva aunque ya se hubiera cambiado.
 *
 * Se limpia DESPUÉS de que Supabase haya leído el fragmento —si se hiciera
 * antes, no habría sesión— y con replaceState, para no dejar el enlace de
 * recuperación en el historial del navegador.
 */
function limpiarFragmentoDeAuth() {
  if (!/[#&](access_token|refresh_token|type=recovery|error_description)=/.test(window.location.hash)) {
    return false
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
  return true
}

/**
 * Sesión del usuario y su ficha de jugador.
 *
 * `esAdmin` sirve solo para decidir qué se enseña. NO es una medida de
 * seguridad: quien manipule este valor en el navegador seguirá chocando con
 * las policies RLS, que son las que de verdad deciden quién escribe qué.
 *
 * `recuperando`: true cuando el usuario acaba de pulsar el enlace de "he
 * olvidado mi contraseña" del correo. Supabase crea la sesión sola y avisa con
 * el evento PASSWORD_RECOVERY; App.jsx usa esta bandera para tapar toda la app
 * con el formulario de nueva contraseña hasta que la establezca.
 */
export function useSesion() {
  const [estado, setEstado] = useState({
    cargando: !MODO_DEMO, user: null, jugador: null, esAdmin: false, esDuenyo: false, recuperando: false,
  })

  useEffect(() => {
    if (MODO_DEMO) return

    let vivo = true

    const cargarJugador = async (user) => {
      if (!user) return { user: null, jugador: null, esAdmin: false, esDuenyo: false }
      // Sin 'email': la columna está deliberadamente fuera del GRANT de
      // authenticated (ver 0007) porque el privilegio de Postgres no es por
      // fila — concederla aquí dejaría a cualquiera leer el correo de
      // cualquier otro jugador con un simple `players?select=email`. El
      // propio correo de quien ha entrado ya está en `user.email`.
      const { data } = await supabase
        .from('players')
        .select('id, user_id, nombre, alias, avatar_url, is_admin, is_owner, activo')
        .eq('user_id', user.id)
        .maybeSingle()
      // El dueño manda sobre el administrador, así que también lo es. Igual
      // que hace is_admin() en la base (0014): si aquí no fuera así, el dueño
      // no vería el panel que sí puede usar.
      return {
        user,
        jugador: data ?? null,
        esAdmin: !!(data?.is_admin || data?.is_owner),
        esDuenyo: !!data?.is_owner,
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      // Ya ha leído el fragmento: se puede quitar de la URL sin perder nada.
      limpiarFragmentoDeAuth()
      const r = await cargarJugador(data.session?.user ?? null)
      if (vivo) setEstado(e => ({ ...e, cargando: false, ...r }))
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, session) => {
      if (evento === 'PASSWORD_RECOVERY') {
        limpiarFragmentoDeAuth()
        if (vivo) setEstado(e => ({ ...e, cargando: false, recuperando: true }))
        return
      }
      const r = await cargarJugador(session?.user ?? null)
      // `recuperando` NO se pisa aquí: los eventos de sesión que Supabase emite
      // justo después de PASSWORD_RECOVERY (SIGNED_IN, INITIAL_SESSION…)
      // apagarían la pantalla de contraseña nueva a media escritura. Salir sí
      // la cancela, que es lo único que la cierra sin haber cambiado nada.
      if (vivo) {
        setEstado(e => ({
          ...e, cargando: false, ...r,
          recuperando: evento === 'SIGNED_OUT' ? false : e.recuperando,
        }))
      }
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

/** Entrada alternativa para quien ya se haya puesto una contraseña. */
export async function entrarConPassword(email, password) {
  if (MODO_DEMO) throw new Error('En modo demo no hay login.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(
    error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.'
      : error.message
  )
}

/**
 * Manda el correo de "he olvidado mi contraseña". Es el mismo mecanismo que
 * el enlace mágico —un enlace de un solo uso—, así que funciona igual aunque
 * la persona nunca haya llegado a establecer una contraseña todavía.
 */
export async function pedirRestablecerPassword(email) {
  if (MODO_DEMO) throw new Error('En modo demo no hay login.')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  })
  if (error) throw new Error(error.message)
}

/** Pone o cambia la contraseña de quien ya ha entrado (por enlace o recuperación). */
export async function establecerPassword(password) {
  if (MODO_DEMO) throw new Error('En modo demo no hay login.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(error.message)
}

export async function salir() {
  if (!MODO_DEMO) await supabase.auth.signOut()
}
