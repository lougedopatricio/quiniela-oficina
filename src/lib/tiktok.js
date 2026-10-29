// El número de una publicación de TikTok, si va en lo que se ha pegado:
//   · la dirección completa: www.tiktok.com/@alguien/video/1234… (o /photo/
//     para las publicaciones de fotos, que el reproductor también enseña);
//   · la del reproductor o la de inserción antigua;
//   · el código de «Insertar» de TikTok (<blockquote … data-video-id="…">);
//   · o el número a secas.
// El enlace corto de «Compartir» (vm.tiktok.com/…) NO lo lleva: solo TikTok
// sabe a qué publicación apunta, y no se lo dice a otras webs.
export function numeroEnEnlace(enlace) {
  const t = String(enlace ?? '').trim()
  if (/^\d{8,25}$/.test(t)) return t
  const m = t.match(/tiktok\.com\/(?:@[^/?#"\s]*\/(?:video|photo)|embed(?:\/v2)?|player\/v1|v|video|photo)\/(\d{8,25})/) ??
    t.match(/data-video-id=["'](\d{8,25})["']/)
  return m ? m[1] : null
}

// Los dos formatos de enlace corto: vm.tiktok.com/… (o vt.) y tiktok.com/t/…
export const esEnlaceCortoDeTiktok = (enlace) =>
  /^https?:\/\/((vm|vt)\.tiktok\.com\/|(www\.)?tiktok\.com\/t\/)/.test(String(enlace ?? '').trim())

// Lo que se enseña cuando se pega un enlace corto: qué hacer para conseguir
// uno que sí lleve el número.
export const AYUDA_ENLACE_CORTO =
  'Ese es el enlace corto de «Compartir», y TikTok no le dice a otras webs a qué vídeo lleva. Ábrelo con el botón de abajo y, cuando cargue el vídeo, copia la dirección de la barra del navegador (la que lleva /video/ y un número largo) y pégala aquí. También vale el código de «Insertar» del vídeo.'
