import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { getPerfil, actualizarPerfil } from '../lib/api.js'
import { MODO_DEMO } from '../lib/supabase.js'
import { useSesion } from '../lib/sesion.js'
import { jugadorDemo } from '../lib/demo.js'
import {
  useAsync, Cargando, Vacio, AvisoError,
  Portada, Destacado, CifraMenor, Seccion, Ganador, Dinero, Avatar,
} from '../components/ui.jsx'
import CambiarFoto from '../components/CambiarFoto.jsx'
import { euros, fechaCorta, decimal } from '../lib/formato.js'
import { titularPerfil } from '../lib/titulares.js'

export default function Perfil() {
  const { id } = useParams()
  const sesion = useSesion()

  // Sin `:id` en la ruta, "Mi expediente" es el de quien ha entrado. Antes esto
  // resolvía a null fuera del modo demo, así que pedía iniciar sesión incluso a
  // quien ya la tenía.
  const playerId = id ?? (MODO_DEMO ? jugadorDemo.id : sesion.jugador?.id ?? null)
  // También es el tuyo si entras por el enlace de la clasificación.
  const esPropio = !id || (MODO_DEMO ? id === jugadorDemo.id : id === sesion.jugador?.id)
  const [recarga, setRecarga] = useState(0)

  const { cargando, error, datos } = useAsync(
    () => (playerId ? getPerfil(playerId) : Promise.resolve(null)),
    [playerId, recarga]
  )

  if (!id && sesion.cargando) return <Cargando filas={7} />

  if (!playerId) {
    // Dos situaciones muy distintas que antes se confundían en un solo mensaje.
    return !id && sesion.user
      ? <Vacio>
          Tu cuenta ({sesion.user.email}) todavía no está asociada a ningún
          participante. Pídele al administrador que te dé de alta con ese correo.
        </Vacio>
      : <Vacio>Entra con tu correo para ver tu expediente.</Vacio>
  }

  // Solo la primera vez: al recargar tras guardar el perfil, que no parpadee
  // la página entera para cambiar un apodo.
  if (cargando && datos?.jugador?.id !== playerId) return <Cargando filas={7} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>No se encuentra a esa persona.</Vacio>

  const { jugador, historial, movimientos, saldo_cents } = datos
  const jugadas = historial.filter(h => h.estado === 'finalizada')
  const total = jugadas.reduce((a, h) => a + h.aciertos, 0)
  const media = jugadas.length ? total / jugadas.length : 0
  const mejor = jugadas.length ? Math.max(...jugadas.map(h => h.aciertos)) : 0
  const victorias = jugadas.filter(h => h.es_ganador).length
  const serie = historial.map(h => ({ jornada: `J${h.jornada}`, aciertos: h.aciertos, ganador: h.es_ganador }))

  return (
    <>
      <Portada
        antetitulo={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Avatar nombre={jugador.nombre} foto={jugador.avatar_url} tamano={24}
                    style={{ borderColor: 'var(--rojo)', color: 'var(--rojo)' }} />
            Expediente
          </span>
        }
        titular={titularPerfil(jugador, jugadas.length, victorias)}
        entradilla={
          jugadas.length
            ? `${jugadas.length} jornada${jugadas.length === 1 ? '' : 's'} jugada${jugadas.length === 1 ? '' : 's'}, ${total} aciertos y una media de ${decimal(media)} por jornada.`
            : 'Todavía sin jornadas disputadas.'
        }
      >
        <div className="destacado">
          <Destacado rotulo="Saldo" valor={euros(saldo_cents)}
                     tono={saldo_cents < 0 ? 'acento' : undefined}
                     nota={saldo_cents < 0 ? 'Pendiente de pagar' : 'A favor'} />
          <Destacado rotulo="Mejor jornada" valor={mejor} nota="en una jornada" />
          <Destacado rotulo="Jornadas ganadas" valor={victorias}
                     nota={victorias ? 'Con premio en el bolsillo' : 'Todavía ninguna'} />
        </div>
      </Portada>

      {esPropio && (
        <EditorPerfil key={jugador.id} jugador={jugador} alGuardar={() => setRecarga(n => n + 1)} />
      )}

      {serie.length > 0 && (
        <Seccion titulo="Jornada a jornada" nota="La línea de puntos es tu media">
          <div style={{ width: '100%', height: 230, marginTop: 14 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--regla)" vertical={false} />
                <XAxis dataKey="jornada" stroke="var(--tinta-3)" fontSize={11} tickLine={false}
                       axisLine={{ stroke: 'var(--regla-fuerte)' }} />
                {/* Sin márgenes negativos: recortaban la primera cifra y el 12 y el 14 se
                    leían «2» y «4». Hasta 15, que es el máximo con el pleno. */}
                <YAxis domain={[0, 15]} ticks={[0, 5, 10, 15]} stroke="var(--tinta-3)" fontSize={11} tickLine={false} axisLine={false} width={26} />
                <Tooltip
                  cursor={{ fill: 'var(--papel-2)' }}
                  formatter={v => [`${v} aciertos`]}
                  separator=""
                  contentStyle={{
                    background: 'var(--papel)', border: '1px solid var(--regla-fuerte)',
                    borderRadius: 2, color: 'var(--tinta)', fontFamily: 'var(--mono)', fontSize: 12,
                  }}
                />
                <ReferenceLine y={media} stroke="var(--tinta-3)" strokeDasharray="3 3" />
                <Bar dataKey="aciertos">
                  {serie.map((d, i) => <Cell key={i} fill={d.ganador ? 'var(--oro)' : 'var(--tinta-2)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Historial">
        {historial.length === 0 ? (
          <Vacio>Todavía no has jugado ninguna jornada.</Vacio>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 96 }}>Jornada</th>
                  <th className="num">Aciertos</th>
                  <th className="num">Puesto</th>
                  <th className="num">Premio</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...historial].reverse().map(h => (
                  <tr key={h.round_id}>
                    <td>
                      <span style={{ fontFamily: 'var(--serif)', fontSize: 19 }}>Jornada {h.jornada}</span>
                      {h.estado === 'en_juego' && (
                        <span className="etiqueta directo" style={{ marginLeft: 8 }}>
                          <span className="punto-vivo" />En juego
                        </span>
                      )}
                    </td>
                    <td className="num destaca">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {h.es_ganador && <Ganador />}{h.aciertos}
                      </span>
                    </td>
                    <td className="num">{h.puesto ? `${h.puesto} de ${h.de}` : '—'}</td>
                    <td className="num">
                      {h.premio_cents ? <Dinero cents={h.premio_cents} conSigno /> : <span style={{ color: 'var(--tinta-3)' }}>—</span>}
                    </td>
                    <td className="num"><Link to={`/jornada/${h.round_id}`} className="boton">Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* La caja va al final y en tono menor: importa, pero no es lo primero
          que uno quiere ver de su propio expediente. */}
      <Seccion titulo="Tu caja" nota="Cuotas, premios y pagos">
        <div className="cifras-menores">
          <CifraMenor rotulo="Aciertos totales" valor={total} />
          <CifraMenor rotulo="Media" valor={decimal(media)} />
          <CifraMenor rotulo="Saldo" valor={euros(saldo_cents)}
                      tono={saldo_cents < 0 ? 'var(--rojo)' : 'var(--verde)'} />
        </div>
        <div className="tabla-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th style={{ width: 90 }}>Fecha</th><th>Concepto</th><th className="num">Importe</th></tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={m.id ?? i}>
                  <td style={{ color: 'var(--tinta-3)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{fechaCorta(m.fecha)}</td>
                  <td>{m.nota}</td>
                  <td className="num"><Dinero cents={m.importe_cents} conSigno /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </>
  )
}

/**
 * Lo que cada uno decide de sí mismo: cómo sale en la clasificación y con
 * qué foto. El nombre real, el alias del Excel y el correo siguen siendo
 * cosa del administrador.
 */
function EditorPerfil({ jugador, alGuardar }) {
  const [apodo, setApodo] = useState(jugador.apodo ?? '')
  const [aviso, setAviso] = useState(null)
  const cambiado = apodo.trim() !== (jugador.apodo ?? '')

  async function guardar(e) {
    e.preventDefault()
    setAviso({ txt: 'Guardando…' })
    try {
      await actualizarPerfil(jugador.id, { apodo })
      setAviso({ txt: apodo.trim() ? `Listo: en la clasificación sales como «${apodo.trim()}».` : 'Listo: vuelves a salir con tu nombre.' })
      alGuardar()
    } catch (err) {
      setAviso({ txt: err.message })
    }
  }

  const fallo = (err) => setAviso({ txt: err.message })
  const fotoCambiada = (url) => {
    setAviso({ txt: url ? 'Foto actualizada.' : 'Foto quitada.' })
    alGuardar()
  }

  return (
    <Seccion titulo="Tu perfil" nota="Así te ve el resto de la oficina">
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '16px 0' }}>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <Avatar nombre={jugador.nombre} foto={jugador.avatar_url} tamano={88} />
          <CambiarFoto playerId={jugador.id} tieneFoto={!!jugador.avatar_url}
                       alCambiar={fotoCambiada} alFallar={fallo} />
        </div>

        <form onSubmit={guardar} style={{ display: 'grid', gap: 8, flex: '1 1 240px', maxWidth: 380 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="rotulo">Apodo en la clasificación</span>
            <input value={apodo} maxLength={24} placeholder={jugador.nombre_real}
                   onChange={e => setApodo(e.target.value)} />
          </label>
          <span style={{ color: 'var(--tinta-3)', fontSize: 12.5 }}>
            Déjalo vacío para salir como «{jugador.nombre_real}».
          </span>
          <button className="principal" type="submit" disabled={!cambiado}
                  style={{ justifySelf: 'start' }}>
            Guardar apodo
          </button>
        </form>
      </div>
      {aviso && <div className="aviso" style={{ marginBottom: 12 }}>{aviso.txt}</div>}
    </Seccion>
  )
}
