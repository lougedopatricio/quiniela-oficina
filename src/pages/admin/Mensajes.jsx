import { useEffect, useState } from 'react'
import { Copy, Check, RotateCcw, Shuffle } from 'lucide-react'
import { getTemporada, getJornadas, getBote, getJornada } from '../../lib/api.js'
import { useAsync, Cargando, AvisoError, Portada, Seccion, Vacio } from '../../components/ui.jsx'
import {
  mensajeApertura, mensajeCierre, mensajeResultados, boteAntesDe, boteDespuesDe, TONOS,
} from '../../lib/mensajes.js'

// ---------------------------------------------------------------------------
// Los mensajes del grupo, ya rellenos: apertura, cierre y resultados.
//
// Se generan con las cifras de la base y se pueden retocar antes de copiar.
// Lo que no sale de la base (quién tiene las papeletas, cómo se paga, el
// formato) se escribe una vez y se recuerda en este navegador.
//
// Para que no sea siempre el mismo texto: tres tonos, frases que rotan cada
// jornada (y «Otra versión» para cambiarlas a mano) y curiosidades sacadas de
// las columnas. Lo que retoque el administrador se guarda por mensaje y
// jornada, así que al volver sigue ahí hasta que pulse «Restablecer».
// ---------------------------------------------------------------------------

const TIPOS = [
  { id: 'apertura', txt: 'Apertura' },
  { id: 'cierre', txt: 'Cierre' },
  { id: 'resultados', txt: 'Resultados' },
]

const AJUSTES_POR_DEFECTO = {
  papeletas: '',
  pago: 'preferiblemente en mano o por Bizum',
  formato: 'Quiniela (14 partidos + el Pleno al 15, en formato 1X2)',
  web: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '',
  tono: 'clasico',
  curiosidades: true,
  tabla: true,
}

const CLAVE = 'quiniela:ajustes-mensajes'
function leerAjustes() {
  try { return { ...AJUSTES_POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') } } catch { return AJUSTES_POR_DEFECTO }
}
function guardarAjustes(a) {
  try { localStorage.setItem(CLAVE, JSON.stringify(a)) } catch { /* sin almacenamiento: no pasa nada */ }
}

// Los retoques a mano, uno por mensaje y jornada.
const claveTexto = (tipo, roundId) => `quiniela:mensaje:${tipo}:${roundId}`
function leerTexto(tipo, roundId) {
  try { return localStorage.getItem(claveTexto(tipo, roundId)) } catch { return null }
}
function guardarTexto(tipo, roundId, texto) {
  try {
    if (texto == null) localStorage.removeItem(claveTexto(tipo, roundId))
    else localStorage.setItem(claveTexto(tipo, roundId), texto)
  } catch { /* sin almacenamiento: se pierde al salir, nada más */ }
}

// Qué jornada tiene sentido para cada mensaje, si no se elige otra.
function jornadaPorDefecto(tipo, jornadas) {
  const por = (estados) => jornadas.find(j => estados.includes(j.estado))
  if (tipo === 'apertura') return por(['abierta', 'borrador']) ?? jornadas[0]
  if (tipo === 'cierre') return por(['cerrada', 'en_juego', 'abierta']) ?? jornadas[0]
  return por(['finalizada']) ?? jornadas[0]
}

export default function Mensajes() {
  const [tipo, setTipo] = useState('apertura')
  const [roundId, setRoundId] = useState('')
  const [ajustes, setAjustes] = useState(leerAjustes)
  const [editado, setEditado] = useState(null)
  const [variante, setVariante] = useState(0)
  const [copiado, setCopiado] = useState(false)

  const base = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [jornadas, bote] = await Promise.all([getJornadas(season.id), getBote(season.id)])
    return { season, jornadas, bote }
  }, [])

  const jornadas = base.datos?.jornadas ?? []
  const elegida = jornadas.find(j => j.round_id === roundId) ?? jornadaPorDefecto(tipo, jornadas)

  // Partidos y columnas: el pleno de la apertura, las curiosidades del cierre
  // y los resultados con sus aciertos y su trofeo.
  const detalle = useAsync(
    () => (elegida ? getJornada(elegida.round_id) : Promise.resolve(null)),
    [elegida?.round_id]
  )

  // Al cambiar de mensaje o de jornada, se recupera lo que se hubiera
  // retocado para ESE mensaje (o el texto generado, si no se tocó).
  useEffect(() => {
    setEditado(elegida ? leerTexto(tipo, elegida.round_id) : null)
    setVariante(0)
  }, [tipo, elegida?.round_id])

  if (base.cargando) return <Cargando filas={5} />
  if (base.error) return <AvisoError error={base.error} />
  if (!base.datos || !elegida) return <Vacio>No hay ninguna jornada todavía.</Vacio>

  const { bote } = base.datos
  const movimientos = bote.movimientos ?? []
  const partidos = detalle.datos?.partidos ?? []
  const columnas = detalle.datos?.boletos ?? []
  const estilo = { tono: ajustes.tono, variante, curiosidades: ajustes.curiosidades, tabla: ajustes.tabla }
  let generado = ''
  let aviso = null

  if (tipo === 'apertura') {
    generado = mensajeApertura({
      jornada: { numero: elegida.numero, cierra_at: elegida.cierra_at, precio_cents: elegida.precio_cents },
      bote: boteAntesDe(elegida.numero, movimientos),
      ajustes, partidos, estilo,
    })
    if (!elegida.cierra_at) aviso = 'Esta jornada no tiene fecha de cierre: ponla en Crear quiniela o en Jornadas para que salga en el mensaje.'
  } else if (tipo === 'cierre') {
    generado = mensajeCierre({ jornada: elegida, boteAntes: boteAntesDe(elegida.numero, movimientos), partidos, columnas, estilo })
    if (!elegida.boletos) aviso = 'Esta jornada todavía no tiene boletos.'
  } else if (detalle.datos) {
    const propios = movimientos.filter(m => m.jornada === elegida.numero)
    generado = mensajeResultados({
      jornada: elegida,
      boletos: columnas,
      partidos,
      botePagado: propios.reduce((a, m) => a + (m.salida_cents ?? 0), 0),
      boteDespues: boteDespuesDe(elegida.numero, movimientos, bote.actual_cents),
      estilo,
    })
    if (elegida.estado !== 'finalizada') aviso = 'Esta jornada todavía no está liquidada: los aciertos y el ganador pueden cambiar.'
  }

  const texto = editado ?? generado

  function editar(valor) {
    setEditado(valor)
    guardarTexto(tipo, elegida.round_id, valor)
  }
  function restablecer() {
    setEditado(null)
    guardarTexto(tipo, elegida.round_id, null)
  }
  function otraVersion() {
    if (editado != null && !window.confirm('Tienes el texto retocado a mano. ¿Lo cambias por otra versión generada?')) return
    restablecer()
    setVariante(v => v + 1)
  }

  function cambiarAjuste(campo, valor) {
    const nuevo = { ...ajustes, [campo]: valor }
    setAjustes(nuevo)
    guardarAjustes(nuevo)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso para el portapapeles: se selecciona para copiar a mano.
      document.getElementById('texto-mensaje')?.select()
    }
  }

  return (
    <>
      <Portada
        antetitulo="Redacción"
        titular="Los mensajes del grupo"
        entradilla="Apertura, cierre y resultados de cada jornada, con las cifras de la web. Retócalos si quieres y cópialos al grupo."
      />

      <Seccion titulo="Qué mensaje">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', padding: '14px 0' }}>
          <div className="pestanas-mini" role="tablist">
            {TIPOS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tipo === t.id}
                      className={tipo === t.id ? 'activo' : ''}
                      onClick={() => { setTipo(t.id); setRoundId('') }}>
                {t.txt}
              </button>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Jornada</span>
            <select value={elegida.round_id} onChange={e => setRoundId(e.target.value)}>
              {jornadas.map(j => (
                <option key={j.round_id} value={j.round_id}>Jornada {j.numero} · {j.estado}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end', paddingBottom: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Tono</span>
            <select value={ajustes.tono} onChange={e => cambiarAjuste('tono', e.target.value)}>
              {TONOS.map(t => <option key={t.id} value={t.id}>{t.txt}</option>)}
            </select>
          </label>
          {tipo !== 'apertura' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={ajustes.curiosidades} onChange={e => cambiarAjuste('curiosidades', e.target.checked)} />
              Curiosidades de la jornada
            </label>
          )}
          {tipo === 'resultados' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={ajustes.tabla} onChange={e => cambiarAjuste('tabla', e.target.checked)} />
              Tabla completa
            </label>
          )}
        </div>
        {tipo === 'apertura' && (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', paddingBottom: 12 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="rotulo">Papeletas disponibles</span>
              <input value={ajustes.papeletas} placeholder="hablar con Silvia" onChange={e => cambiarAjuste('papeletas', e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="rotulo">Cómo se paga</span>
              <input value={ajustes.pago} onChange={e => cambiarAjuste('pago', e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="rotulo">Formato</span>
              <input value={ajustes.formato} onChange={e => cambiarAjuste('formato', e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="rotulo">Enlace a la web (vacío = no sale)</span>
              <input value={ajustes.web} onChange={e => cambiarAjuste('web', e.target.value)} />
            </label>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="El mensaje"
        accion={
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={otraVersion} title="Las mismas cifras, contadas con otras frases">
              <Shuffle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Otra versión
            </button>
            {editado != null && (
              <button type="button" onClick={restablecer} title="Descartar tus cambios y volver al texto generado">
                <RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Restablecer
              </button>
            )}
            <button className="principal" type="button" onClick={copiar} disabled={!texto}>
              {copiado
                ? <><Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Copiado</>
                : <><Copy size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Copiar</>}
            </button>
          </div>
        }
      >
        {aviso && <div className="aviso" style={{ marginTop: 12 }}>{aviso}</div>}
        {editado != null && (
          <div className="aviso" style={{ marginTop: 12 }}>
            Texto retocado a mano y guardado en este navegador. Si cambian las cifras, pulsa «Restablecer» para regenerarlo.
          </div>
        )}
        {detalle.cargando && !detalle.datos ? <Cargando filas={6} /> : (
          <textarea id="texto-mensaje" value={texto} onChange={e => editar(e.target.value)}
                    rows={Math.min(34, Math.max(12, texto.split('\n').length + 1))}
                    style={{ width: '100%', marginTop: 12, fontSize: 14, lineHeight: 1.5, padding: 12, fontFamily: 'var(--sans)' }} />
        )}
        <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', marginTop: 8 }}>
          Escribe aquí mismo lo que quieras cambiar: se guarda solo, para este mensaje y esta
          jornada. La redacción cambia cada semana; «Otra versión» da otra con las mismas cifras.
        </p>
      </Seccion>
    </>
  )
}
