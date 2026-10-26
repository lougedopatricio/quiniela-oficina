import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { getJornada, getParticipantes } from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Escudo } from '../../components/ui.jsx'
import { fechaCorta, nombreVisible } from '../../lib/formato.js'

/**
 * Los boletos en papel de una jornada, listos para imprimir: seis por folio
 * A4, como el Word que se usaba, pero con el escudo de cada equipo y sin
 * copiar y pegar la tabla del Excel cada semana.
 *
 * El PDF lo genera el propio navegador con «Imprimir → Guardar como PDF»: es
 * lo que mejor respeta los tamaños exactos de la página y no hace falta
 * cargar ninguna librería. La página abre el diálogo sola en cuanto están
 * pintados todos los escudos.
 *
 * Se pinta fuera del marco de la app (sin cabecera ni menú): lo que se ve es
 * exactamente lo que sale por la impresora.
 */
export default function ImprimirBoletos() {
  const { id } = useParams()
  const [conNombres, setConNombres] = useState(false)
  const [hojasEnBlanco, setHojasEnBlanco] = useState(1)
  const yaImpreso = useRef(false)

  const { cargando, error, datos } = useAsync(async () => {
    const [jornada, gente] = await Promise.all([getJornada(id), getParticipantes().catch(() => [])])
    return { ...jornada, gente: gente.filter(p => p.activo) }
  }, [id])

  // El diálogo de imprimir, solo la primera vez y cuando ya han cargado (o
  // fallado) todas las imágenes: si se abre antes, salen huecos en el papel.
  useEffect(() => {
    if (!datos || yaImpreso.current) return
    const imgs = [...document.querySelectorAll('.boletos-impresos img')]
    Promise.all(imgs.map(i => (i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok }))))
      .then(() => {
        if (yaImpreso.current) return
        yaImpreso.current = true
        setTimeout(() => window.print(), 300)
      })
  }, [datos])

  if (cargando) return <div style={{ padding: 24 }}><Cargando filas={4} /></div>
  if (error) return <div style={{ padding: 24 }}><AvisoError error={error} /></div>

  const { round, partidos, gente } = datos
  const quince = Array.from({ length: 15 }, (_, i) => partidos.find(m => m.orden === i + 1) ?? null)

  const nombres = conNombres
    ? [...gente].sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es')).map(nombreVisible)
    : Array(Math.max(1, hojasEnBlanco) * 6).fill('')
  // Siempre hojas completas: el último folio se rellena con boletos en blanco.
  while (nombres.length % 6) nombres.push('')
  const hojas = Array.from({ length: nombres.length / 6 }, (_, h) => nombres.slice(h * 6, h * 6 + 6))

  return (
    <div className="impresion">
      <style>{CSS}</style>

      <div className="impresion-barra no-imprimir">
        <Link to="/admin/jornadas" className="boton"><ArrowLeft size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Volver</Link>
        <strong>Boletos de la jornada {round.numero}</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={conNombres} onChange={e => setConNombres(e.target.checked)}
                 style={{ width: 16, height: 16 }} />
          Con el nombre de cada participante ({gente.length})
        </label>
        {!conNombres && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Folios en blanco
            <input type="number" min={1} max={20} value={hojasEnBlanco} style={{ width: 64 }}
                   onChange={e => setHojasEnBlanco(Math.min(20, Math.max(1, +e.target.value || 1)))} />
          </label>
        )}
        <button className="principal" onClick={() => window.print()}>
          <Printer size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Imprimir o guardar PDF
        </button>
        <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>
          En el diálogo, elige «Guardar como PDF» para tener el archivo. Papel A4, sin márgenes extra.
        </span>
      </div>

      {quince.filter(Boolean).length < 14 && (
        <div className="aviso no-imprimir" style={{ margin: '12px 16px' }}>
          Esta jornada todavía no tiene todos los partidos: los que faltan salen en blanco.
        </div>
      )}

      <div className="boletos-impresos">
        {hojas.map((hoja, h) => (
          <section key={h} className="folio">
            {hoja.map((nombre, k) => (
              <Boleto key={k} nombre={nombre} round={round} partidos={quince} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function Boleto({ nombre, round, partidos }) {
  return (
    <div className="boleto">
      <div className="boleto-cabecera">
        <span className="boleto-nombre">Nombre: <b>{nombre}</b></span>
        <span className="boleto-jornada">
          Jornada {round.numero}{round.cierra_at ? ` · ${fechaCorta(round.cierra_at)}` : ''}
        </span>
      </div>
      <table className="boleto-tabla">
        <tbody>
          {partidos.map((m, i) => {
            const pleno = i === 14
            return (
              <tr key={i} className={pleno ? 'pleno' : undefined}>
                <td className="boleto-n">{pleno ? 'PLENO AL 15' : i + 1}</td>
                <td className="boleto-partido">
                  {m ? (
                    <>
                      <span className="eq"><Escudo nombre={m.local} laeId={m.lae_id_local} tamano={13} />{m.local}</span>
                      <span className="guion">-</span>
                      <span className="eq"><Escudo nombre={m.visitante} laeId={m.lae_id_visitante} tamano={13} />{m.visitante}</span>
                    </>
                  ) : null}
                </td>
                {['1', 'X', '2'].map(s => <td key={s} className="casilla">{s}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Medidas en milímetros para que el papel salga igual en cualquier
// impresora: A4 menos 8 mm de margen son 194 × 281, en una rejilla de 2 × 3.
const CSS = `
@page { size: A4 portrait; margin: 8mm; }
.impresion { background: var(--papel-2); min-height: 100vh; color: #111; }
.impresion-barra {
  position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 14px; align-items: center;
  padding: 12px 16px; background: var(--papel); border-bottom: 1px solid var(--regla); font-size: 13.5px;
}
.boletos-impresos { padding: 16px; display: grid; gap: 16px; justify-content: center; }
.folio {
  width: 194mm; height: 281mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.15);
  display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr);
  gap: 5mm; padding: 0; box-sizing: border-box; break-after: page; page-break-after: always;
}
.folio:last-child { break-after: auto; page-break-after: auto; }
.boleto { display: flex; flex-direction: column; min-height: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.boleto-cabecera {
  display: flex; justify-content: space-between; align-items: baseline; gap: 6px;
  font-size: 9pt; padding: 0 0 1.2mm; border-bottom: 0.4mm solid #000; margin-bottom: 0.8mm;
}
.boleto-nombre { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.boleto-nombre b { font-weight: 700; }
.boleto-jornada { font-size: 7.5pt; color: #444; white-space: nowrap; }
.boleto-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1; font-size: 7.6pt; }
.boleto-tabla td { border: 0.25mm solid #000; padding: 0 1mm; height: 5mm; vertical-align: middle; }
.boleto-n { width: 7.5mm; text-align: center; font-weight: 700; }
.boleto-tabla tr.pleno .boleto-n { font-size: 5.8pt; line-height: 1; padding: 0 .3mm; }
.boleto-tabla tr.pleno td { border-top-width: 0.5mm; }
.boleto-partido { white-space: nowrap; overflow: hidden; }
.boleto-partido .eq { display: inline-flex; align-items: center; gap: 1mm; max-width: 44%; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
.boleto-partido .guion { margin: 0 1mm; }
.boleto-partido .escudo { flex: none; width: 3.4mm !important; height: 3.4mm !important; font-size: 4pt; }
.casilla { width: 5.5mm; text-align: center; color: #777; font-size: 7pt; }
@media print {
  html, body { background: #fff !important; }
  .no-imprimir { display: none !important; }
  .impresion { background: #fff; min-height: 0; }
  .boletos-impresos { padding: 0; gap: 0; display: block; }
  .folio { box-shadow: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`
