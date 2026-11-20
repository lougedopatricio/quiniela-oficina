// El vídeo de YouTube que hay en lo que se ha pegado, si lo hay (0029):
//   · youtube.com/watch?v=CODIGO (también m. y music.), con más parámetros
//     detrás o delante;
//   · youtu.be/CODIGO, el enlace de «Compartir»;
//   · youtube.com/shorts/CODIGO, que es vertical;
//   · youtube.com/embed/CODIGO, youtube-nocookie.com/embed/… y /live/…;
//   · el código de «Insertar» (<iframe src=".../embed/CODIGO" …>).
// Devuelve { id, vertical } o null. El código son siempre 11 caracteres.
export function videoDeYoutube(enlace) {
  const t = String(enlace ?? '').trim()
  const ID = '([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])'
  const dominio = '(?:https?:\\/\\/)?(?:(?:www|m|music)\\.)?'
  const corto = t.match(new RegExp(`${dominio}youtu\\.be\\/${ID}`))
  if (corto) return { id: corto[1], vertical: false }
  const short = t.match(new RegExp(`${dominio}youtube\\.com\\/shorts\\/${ID}`))
  if (short) return { id: short[1], vertical: true }
  const ruta = t.match(new RegExp(`${dominio}youtube(?:-nocookie)?\\.com\\/(?:embed|live|v)\\/${ID}`))
  if (ruta) return { id: ruta[1], vertical: false }
  if (new RegExp(`${dominio}youtube\\.com\\/watch`).test(t)) {
    const v = t.match(new RegExp(`[?&]v=${ID}`))
    if (v) return { id: v[1], vertical: false }
  }
  return null
}

export const esEnlaceDeYoutube = (enlace) => /(youtube(-nocookie)?\.com|youtu\.be)\//.test(String(enlace ?? ''))
