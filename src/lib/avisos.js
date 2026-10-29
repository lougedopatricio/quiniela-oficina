import { useEffect, useState } from 'react'
import { getCuentasSinFicha } from './api.js'

// Cuentas que han entrado sin ficha de participante, para avisar al
// administrador (cabecera y menús). Se vuelven a pedir al cambiar de página,
// cada dos minutos y cuando Participantes avisa de que ha asignado alguna.
const EVENTO = 'quiniela:cuentas-cambiadas'

export const avisarCuentasCambiadas = () => window.dispatchEvent(new Event(EVENTO))

export function useCuentasSinFicha(activo, clave) {
  const [cuentas, setCuentas] = useState([])
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!activo) return
    const otra = () => setVuelta(n => n + 1)
    const reloj = setInterval(otra, 120000)
    window.addEventListener(EVENTO, otra)
    return () => { clearInterval(reloj); window.removeEventListener(EVENTO, otra) }
  }, [activo])

  useEffect(() => {
    if (!activo) { setCuentas([]); return }
    let vivo = true
    // Un fallo aquí no debe romper ninguna página: el aviso simplemente no sale.
    getCuentasSinFicha().then(c => vivo && setCuentas(c ?? [])).catch(() => {})
    return () => { vivo = false }
  }, [activo, clave, vuelta])

  return cuentas
}
