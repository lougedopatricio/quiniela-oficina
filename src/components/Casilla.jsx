import { marcaDe } from '../lib/marcas.js'

// ---------------------------------------------------------------------------
// Una casilla del boleto, como la de papel: el signo impreso en pequeño y,
// si está elegida, la marca de su dueño encima, a boli.
//
// El giro de cada marca sale de la propia casilla (no al azar) para que no
// baile al repintar, pero ninguna quede igual que la de al lado: a mano
// nunca salen dos idénticas.
// ---------------------------------------------------------------------------

export function DibujoMarca({ marca, giro = 0, animar = true, tamano }) {
  const m = marcaDe(marca)
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={`marca-boli${animar ? ' animada' : ''}`}
         style={{ transform: `rotate(${giro}deg)`, ...(tamano ? { width: tamano, height: tamano } : {}) }}>
      {(m.r ?? []).map((d, i) => <path key={`r${i}`} d={d} className="mancha" />)}
      {(m.t ?? []).map((d, i) => (
        <path key={`t${i}`} d={d} pathLength="1" className="trazo"
              style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </svg>
  )
}

const giroDe = (clave) => {
  let h = 0
  for (const c of String(clave)) h = (h * 31 + c.charCodeAt(0)) | 0
  return (Math.abs(h) % 17) - 8   // entre -8 y 8 grados
}

export default function Casilla({ texto, marcada, marca, onClick, disabled, clave, oro = false, titulo }) {
  return (
    <button type="button" className={`casilla-boleto${marcada ? ' marcada' : ''}${oro ? ' oro' : ''}`}
            onClick={onClick} disabled={disabled} aria-pressed={marcada} title={titulo ?? texto}>
      <span className="impreso">{texto}</span>
      {marcada && <DibujoMarca marca={marca} giro={giroDe(clave ?? texto)} />}
    </button>
  )
}
