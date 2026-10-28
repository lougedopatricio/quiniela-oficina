// El número de un vídeo de TikTok, si va en lo que se ha pegado: la
// dirección completa (www.tiktok.com/@alguien/video/1234…), la del
// reproductor o el número a secas. El enlace corto de compartir no lo lleva.
export function numeroEnEnlace(enlace) {
  const t = String(enlace ?? '').trim()
  if (/^\d{8,25}$/.test(t)) return t
  const m = t.match(/tiktok\.com\/(?:@[^/?#]+\/video|embed(?:\/v2)?|player\/v1|v|video)\/(\d{8,25})/)
  return m ? m[1] : null
}

export const esEnlaceCortoDeTiktok = (enlace) => /^https?:\/\/(vm|vt)\.tiktok\.com\//.test(String(enlace ?? '').trim())
