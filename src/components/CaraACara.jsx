import { useState } from 'react'
import { Equipo } from './ui.jsx'
import { compararColumnas } from '../lib/comparar.js'

// ---------------------------------------------------------------------------
// Dos columnas, partido a partido.
//
// La tabla de la jornada dice quién ganó; esto dice dónde se decidió. En una
// quiniela de oficina casi todo el mundo pone lo mismo en diez partidos y la
// jornada se juega en los otros cuatro: lo interesante no son las columnas
// enteras, sino en qué se separan.
//
// Por eso las filas donde coinciden se apagan y las de la discrepancia se
// quedan a plena tinta. Es la misma idea de la portada: destacar quitando.
// ---------------------------------------------------------------------------

export default function CaraACara({ partidos, boletos }) {
  const [izquierda, setIzquierda] = useState(boletos[0]?.player_id)
  const [derecha, setDerecha] = useState(boletos[1]?.player_id)

  if (boletos.length < 2) return null

  const a = boletos.find(x => x.player_id === izquierda) ?? boletos[0]
  const b = boletos.find(x => x.player_id === derecha) ?? boletos[1]

  // Los que puntúan esta jornada, no los catorce primeros: el 15 puede contar.
  const partidosQuePuntuan = partidos.filter(m => m.modo_puntuacion !== 'no_puntua')
  const signos = partidosQuePuntuan.map(m => m.signo ?? m.signo_provisional ?? null)

  const { filas, coinciden, discrepan, ganaA, ganaB, fallanLosDos, sinResolver } =
    compararColumnas(signos, a.picks, b.picks)

  // Las discrepancias que ya tienen signo. Mientras la jornada se juega, el
  // resto todavía no ha dado ventaja a nadie y decir "gana 0" sonaría a que ha
  // fallado, cuando lo que pasa es que aún no se ha jugado.
  const decididos = discrepan - sinResolver

  return (
    <>
      <div className="cara-a-cara-mandos">
        <Selector opciones={boletos} valor={a.player_id} alCambiar={setIzquierda} excluir={b.player_id} />
        <span className="versus">contra</span>
        <Selector opciones={boletos} valor={b.player_id} alCambiar={setDerecha} excluir={a.player_id} />
      </div>

      <p className="entradilla">
        Coinciden en {coinciden} de los {partidosQuePuntuan.length} que puntúan
        {discrepan === 0
          ? '. Columnas idénticas: esta jornada no se decide entre ellos.'
          : `, así que la jornada se juega en ${discrepan}.`}
        {decididos > 0 && (
          <>
            {' '}De esos, <strong>{a.nombre}</strong> gana {ganaA} y{' '}
            <strong>{b.nombre}</strong> {ganaB}
            {fallanLosDos > 0 && `, y en ${fallanLosDos} fallan los dos`}.
          </>
        )}
        {sinResolver > 0 && (
          <>
            {' '}Quedan {sinResolver} por decidir
            {decididos === 0 && ': todo lo que les separa está aún por jugar'}.
          </>
        )}
      </p>

      <div className="tabla-scroll">
        <table className="cara-a-cara">
          <thead>
            <tr>
              <th style={{ width: 28 }}>Nº</th>
              <th className="num" style={{ width: 64 }}>{a.nombre}</th>
              <th>Encuentro</th>
              <th className="num" style={{ width: 46 }}>Signo</th>
              <th style={{ width: 64 }}>{b.nombre}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const m = partidosQuePuntuan[f.i]
              return (
              <tr key={f.i} className={f.coinciden ? 'coinciden' : 'discrepan'}>
                <td className="posicion">{String(m.orden).padStart(2, '0')}</td>
                <td className="num">
                  <Casilla pick={f.pickA} signo={f.signo} />
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Equipo nombre={m.local} laeId={m.lae_id_local} />
                    <span style={{ color: 'var(--tinta-3)' }}>–</span>
                    <Equipo nombre={m.visitante} laeId={m.lae_id_visitante} alinear="derecha" />
                  </span>
                </td>
                <td className="num">
                  {f.signo
                    ? <span className="signo oficial">{f.signo}</span>
                    : <span className="signo vacio">·</span>}
                </td>
                <td>
                  <Casilla pick={f.pickB} signo={f.signo} />
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Fuera del componente a propósito: definido dentro se recrearía en cada
// render y React remontaría el <select>, que pierde el foco mientras se usa.
const Selector = ({ opciones, valor, alCambiar, excluir }) => (
  <select value={valor} onChange={e => alCambiar(e.target.value)}>
    {opciones.map(o => (
      <option key={o.player_id} value={o.player_id} disabled={o.player_id === excluir}>
        {o.nombre}
      </option>
    ))}
  </select>
)

/** Un signo de la columna, coloreado solo cuando ya se sabe el resultado. */
const Casilla = ({ pick, signo }) => {
  if (pick == null) return <span className="signo vacio">·</span>
  const clase = signo == null ? '' : pick === signo ? 'acierto' : 'fallo'
  return <span className={`signo ${clase}`}>{pick}</span>
}
