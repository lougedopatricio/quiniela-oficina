import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { subirFoto, quitarFoto } from '../lib/api.js'

/**
 * Botones para poner o quitar la foto de alguien. Lo usan el propio jugador
 * desde su expediente y el administrador desde la plantilla: la base decide
 * quién puede (0016), esto solo pinta los botones y avisa del resultado.
 *
 * `compacto` deja solo los iconos, para que quepa en una fila de tabla.
 */
export default function CambiarFoto({ playerId, tieneFoto, alCambiar, alFallar, compacto = false }) {
  const input = useRef(null)
  const [trabajando, setTrabajando] = useState(false)

  async function hacer(accion) {
    setTrabajando(true)
    try {
      alCambiar?.(await accion())
    } catch (err) {
      alFallar?.(err)
    } finally {
      setTrabajando(false)
    }
  }

  function elegido(e) {
    const archivo = e.target.files?.[0]
    // Se limpia ya: si no, elegir otra vez el mismo archivo no dispara onChange.
    e.target.value = ''
    if (archivo) hacer(() => subirFoto(playerId, archivo))
  }

  const estilo = compacto ? { padding: '5px 9px' } : undefined

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input ref={input} type="file" accept="image/*" hidden onChange={elegido} />
      <button type="button" style={estilo} disabled={trabajando}
              title={tieneFoto ? 'Cambiar la foto' : 'Poner una foto'}
              onClick={() => input.current?.click()}>
        <Camera size={14} style={{ verticalAlign: -2, marginRight: compacto ? 0 : 5 }} />
        {!compacto && (trabajando ? 'Subiendo…' : tieneFoto ? 'Cambiar foto' : 'Poner foto')}
      </button>
      {tieneFoto && (
        <button type="button" style={estilo} disabled={trabajando} title="Quitar la foto"
                onClick={() => hacer(async () => { await quitarFoto(playerId); return null })}>
          <X size={14} style={{ verticalAlign: -2, marginRight: compacto ? 0 : 5 }} />
          {!compacto && 'Quitar'}
        </button>
      )}
    </span>
  )
}
