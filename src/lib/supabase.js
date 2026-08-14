import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Sin configuración, la app arranca igual con datos de ejemplo. Así se puede
 * enseñar a la oficina antes de montar nada, y el desarrollo del frontend no
 * depende de tener el backend en pie.
 */
export const MODO_DEMO = !url || !key || url.includes('xxxxxxxx')

export const supabase = MODO_DEMO ? null : createClient(url, key)

/**
 * La anon key es pública a propósito: viaja dentro del bundle que se publica
 * en GitHub Pages. La seguridad está entera en las policies RLS (0003), no en
 * ocultarla. La que NUNCA puede aparecer aquí es la service_role.
 */
