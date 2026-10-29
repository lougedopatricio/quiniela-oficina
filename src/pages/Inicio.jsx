import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ticket, BarChart3, CalendarDays, PiggyBank, Wallet, UserRound, Trophy, Printer } from 'lucide-react'
import { getTemporada, getBote, getJornadas, getJornada, getClasificacion, numeroDeTiktok, ponerMemeDeLaJornada } from '../lib/api.js'
import { useAsync, Cargando, Vacio, AvisoError, Portada, Destacado, Seccion } from '../components/ui.jsx'
import { euros, cuentaAtras, fechaHora } from '../lib/formato.js'
import { useSesion } from '../lib/sesion.js'
import { MODO_DEMO } from '../lib/supabase.js'

// ---------------------------------------------------------------------------
// La portada: lo que hay que saber de un vistazo y, debajo, la bienvenida.
//
// La clasificación ya no vive aquí: tiene su propia página (Ranking), con
// gráfica y tabla ordenable. La portada cuenta lo que pasa esta semana —qué
// se puede jugar, cuánto hay en el bote, quién ganó la última— y le explica
// a quien llega por primera vez qué puede hacer.
//
// Los memes son nuestros: viñetas dibujadas con CSS y emojis, sin fotos de
// nadie ni imágenes de fuera.
// ---------------------------------------------------------------------------

export default function Inicio() {
  const sesion = useSesion()
  const { cargando, error, datos } = useAsync(async () => {
    const season = await getTemporada()
    if (!season) return null
    const [bote, jornadas, tabla] = await Promise.all([
      getBote(season.id), getJornadas(season.id), getClasificacion(season.id),
    ])
    const ultima = jornadas.find(j => j.estado === 'finalizada')
    const detalleUltima = ultima ? await getJornada(ultima.round_id) : null
    return { season, bote, jornadas, participantes: tabla.length, ultima, detalleUltima }
  }, [])

  if (cargando) return <Cargando filas={7} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Todavía no hay ninguna temporada abierta.</Vacio>

  const { season, bote, jornadas, participantes, ultima, detalleUltima } = datos
  const abierta = jornadas.find(j => j.estado === 'abierta')
  const enJuego = jornadas.find(j => j.estado === 'en_juego')
  const finalizadas = jornadas.filter(j => j.estado === 'finalizada')
  const repartido = finalizadas.reduce((a, j) => a + (j.premio_cents ?? 0), 0)
  const ganadores = (detalleUltima?.boletos ?? []).filter(b => b.es_ganador)
  const plazo = abierta?.cierra_at ? cuentaAtras(abierta.cierra_at) : null
  const nombre = sesion.jugador ? (sesion.jugador.apodo || sesion.jugador.nombre) : null

  return (
    <>
      <div className="portada-con-lateral">
      <div>
      <Portada
        antetitulo={
          enJuego
            ? <>{season.nombre}<span className="etiqueta directo" style={{ marginLeft: 4 }}>
                <span className="punto-vivo" />Jornada {enJuego.numero} en juego</span></>
            : season.nombre
        }
        titular={nombre ? `Bienvenido al vestuario, ${nombre}` : 'Catorce partidos, un pleno y ninguna excusa'}
        entradilla={`${finalizadas.length} jornada${finalizadas.length === 1 ? '' : 's'} disputada${finalizadas.length === 1 ? '' : 's'}, ${participantes} valientes y la columna a ${euros(season.precio_columna_cents)}. Esto es lo que hay esta semana.`}
      >
        <div className="destacado cuatro">
          <Destacado rotulo="El bote" valor={euros(bote.actual_cents)} tono="oro"
                     nota="Se lo lleva quien lo acierte todo" />
          <Destacado
            rotulo={abierta ? `Jornada ${abierta.numero}` : enJuego ? `Jornada ${enJuego.numero}` : 'Próxima jornada'}
            valor={abierta ? (plazo === 'cerrado' ? 'Cerrada' : 'Abierta') : enJuego ? 'En juego' : 'Sin abrir'}
            tono={abierta && plazo !== 'cerrado' ? 'acento' : undefined}
            nota={abierta
              ? (plazo && plazo !== 'cerrado' ? `Cierra en ${plazo} · ${fechaHora(abierta.cierra_at)}` : 'Echa tu columna')
              : enJuego ? 'Se puede seguir en directo' : 'Atento a la siguiente'} />
          <Destacado
            rotulo={ultima ? `Ganó la jornada ${ultima.numero}` : 'Última jornada'}
            valor={ganadores.length ? ganadores.map(g => g.nombre).join(' y ') : '—'}
            nota={ganadores.length ? `Con ${ganadores[0].aciertos} aciertos` : 'Todavía no se ha jugado ninguna'} />
          <Destacado rotulo="Repartido en premios" valor={euros(repartido)}
                     nota={`En ${finalizadas.length} jornada${finalizadas.length === 1 ? '' : 's'}`} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
          {abierta && plazo !== 'cerrado' && (
            <Link to="/jugar" className="boton principal">Echar mi columna</Link>
          )}
          {enJuego && <Link to={`/jornada/${enJuego.round_id}`} className="boton principal">Ver el directo</Link>}
          <Link to="/ranking" className="boton">Ver el ranking</Link>
        </div>
      </Portada>
      </div>
      <MemeDeLaJornada season={season} puedeCambiarlo={MODO_DEMO || sesion.esAdmin} />
      </div>

      <section className="bienvenida">
        <div className="bienvenida-cabecera">
          <div className="antetitulo">Para quien llega nuevo</div>
          <h2 className="bienvenida-titular">Esto no es una quiniela.<br />Es <em>la</em> quiniela.</h2>
          <p className="entradilla">
            Cada semana, catorce partidos y el Pleno al 15. Uno, equis o dos. La mitad de lo que
            se juega va para quien más acierte; la otra mitad, al bote, que solo revienta quien
            lo clava todo. Si nadie lo consigue en toda la temporada, el bote acaba en una cena.
            Aquí no se viene a participar: se viene a ganar la jornada y a recordárselo al resto
            el lunes en la máquina del café.
          </p>
        </div>

        <div className="funciones">
          <Funcion icono={Ticket} titulo="Juega tu columna" a="/jugar">
            Elige 1, X o 2 en los catorce partidos y el pleno antes de que cierre. Puedes
            cambiarla hasta el último minuto; la cuota se apunta sola.
          </Funcion>
          <Funcion icono={BarChart3} titulo="Mira el ranking" a="/ranking">
            La temporada entera en una gráfica, con la foto de cada uno al final de su línea.
            Y una tabla para ordenar por lo que quieras: aciertos, media, empates…
          </Funcion>
          <Funcion icono={CalendarDays} titulo="Sigue cada jornada" a="/jornadas">
            Los partidos, los resultados y la columna de todos en cuanto cierra el plazo. El
            domingo, la clasificación de la jornada se mueve en directo.
          </Funcion>
          <Funcion icono={PiggyBank} titulo="Vigila el bote" a="/bote">
            Cuánto hay, cómo ha ido creciendo y quién estuvo a punto de llevárselo.
          </Funcion>
          <Funcion icono={Wallet} titulo="Cuentas claras" a="/saldos">
            Lo que llevas pagado, lo que has ganado y lo que debes. Sin libretas ni discusiones.
          </Funcion>
          <Funcion icono={UserRound} titulo="Tu expediente" a="/perfil">
            Tus números jornada a jornada. Y ponte un apodo y una foto: es lo que verá toda la
            oficina en el ranking.
          </Funcion>
        </div>

        <div className="reglas-rapidas">
          <div><Trophy size={18} /><span><b>Gana la jornada</b> quien más acierte. Si empatáis, el premio se reparte a partes iguales.</span></div>
          <div><span className="reglas-15">15</span><span><b>El Pleno al 15</b> solo suma si aciertas los catorce. Y si lo aciertas todo, el bote es tuyo.</span></div>
          <div><Printer size={18} /><span><b>¿Prefieres papel?</b> Pide tu boleto impreso al que lleva la quiniela.</span></div>
        </div>
      </section>

      <Seccion titulo="Momentos que todos hemos vivido" nota="Basado en hechos reales">
        <div className="memes">
          <Meme arriba="Yo el viernes" emoji="😎" abajo="Esta semana hago pleno" />
          <Meme arriba="Yo el domingo a las 23:00" emoji="🫠" abajo="Tres aciertos y el pleno al revés" />
          <Meme arriba="Toda la oficina: 1, 1, 1, 1…" emoji="⚽" abajo="El Getafe: X" />
          <Meme arriba="Nadie:" emoji="📈" abajo="El bote, jornada tras jornada" />
        </div>
      </Seccion>

      {MODO_DEMO && (
        <p style={{ fontSize: 12.5, color: 'var(--tinta-3)', marginTop: 24 }}>
          En la edición de muestra no hay que entrar: puedes curiosear todas las secciones.
        </p>
      )}
    </>
  )
}

/**
 * El vídeo de TikTok de la semana, con el reproductor oficial de TikTok: el
 * vídeo se ve desde allí, no se copia. Solo se guarda su número (0024), y la
 * dirección del reproductor la monta esta página, así que no se puede colar
 * otra web. El administrador lo cambia aquí mismo.
 */
function MemeDeLaJornada({ season, puedeCambiarlo }) {
  const [id, setId] = useState(season.meme_tiktok_id ?? null)
  const [enlace, setEnlace] = useState('')
  const [aviso, setAviso] = useState(null)
  const [editando, setEditando] = useState(false)
  const [corto, setCorto] = useState(null)

  if (!id && !puedeCambiarlo) return null

  async function guardar(e) {
    e.preventDefault()
    setAviso('Buscando el vídeo…')
    setCorto(null)
    try {
      const nuevo = enlace.trim() ? await numeroDeTiktok(enlace) : null
      await ponerMemeDeLaJornada(season.id, nuevo)
      setId(nuevo); setEnlace(''); setEditando(false); setAviso(null)
    } catch (err) {
      setAviso(err.message)
      setCorto(err.enlaceCorto ?? null)
    }
  }

  return (
    <aside className="meme-jornada">
      <div className="rotulo">Meme de la jornada</div>
      {id ? (
        <div className="meme-jornada-video">
          <iframe
            src={`https://www.tiktok.com/player/v1/${id}?description=1&music_info=0&rel=0&native_context_menu=0`}
            title="Meme de la jornada (TikTok)"
            allow="encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="meme-jornada-vacio">Todavía no hay meme esta semana. Pega abajo el enlace de un TikTok.</div>
      )}
      {id && (
        <a href={`https://www.tiktok.com/video/${id}`} target="_blank" rel="noreferrer" className="meme-jornada-enlace">
          Verlo en TikTok ↗
        </a>
      )}
      {puedeCambiarlo && (editando || !id ? (
        <form onSubmit={guardar} style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          <textarea value={enlace} onChange={e => setEnlace(e.target.value)} rows={2}
                    placeholder="https://www.tiktok.com/@…/video/…" style={{ resize: 'vertical', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="principal" type="submit" style={{ padding: '5px 11px' }}
                    disabled={!enlace.trim() && !id}>
              {enlace.trim() || !id ? 'Poner este' : 'Quitar el meme'}
            </button>
            {id && <button type="button" onClick={() => { setEditando(false); setAviso(null) }} style={{ padding: '5px 11px' }}>Cancelar</button>}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--tinta-3)' }}>
            Pega la dirección completa del vídeo (la que lleva /video/ y un número) o su código de «Insertar». Solo lo ves tú, que eres administrador.
          </span>
        </form>
      ) : (
        <button type="button" onClick={() => setEditando(true)} style={{ marginTop: 10, fontSize: 12, padding: '4px 10px' }}>
          Cambiar el meme
        </button>
      ))}
      {aviso && (
        <div className="aviso" style={{ marginTop: 8, fontSize: 12.5 }}>
          {aviso}
          {corto && (
            <div style={{ marginTop: 8 }}>
              <a href={corto} target="_blank" rel="noreferrer" className="boton" style={{ fontSize: 12, padding: '4px 10px' }}>
                Abrir en TikTok ↗
              </a>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function Funcion({ icono: Icono, titulo, a, children }) {
  return (
    <Link to={a} className="funcion">
      <span className="funcion-icono"><Icono size={20} /></span>
      <span className="funcion-titulo">{titulo}</span>
      <span className="funcion-texto">{children}</span>
      <span className="funcion-ir">Ir →</span>
    </Link>
  )
}

/** Una viñeta en formato meme: texto arriba, dibujo en medio, remate abajo. */
function Meme({ arriba, emoji, abajo }) {
  return (
    <figure className="meme">
      <figcaption className="meme-texto">{arriba}</figcaption>
      <div className="meme-dibujo" aria-hidden="true">{emoji}</div>
      <figcaption className="meme-texto">{abajo}</figcaption>
    </figure>
  )
}
