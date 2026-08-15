import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getJornada, suscribirseAJornada } from '../lib/api.js'
import {
  useAsync, Cargando, Vacio, AvisoError,
  Portada, Destacado, CifraMenor, Seccion, Persona, Posicion, Ganador, TiraSignos, Dinero,
} from '../components/ui.jsx'
import { euros, fechaHora } from '../lib/formato.js'
import { titularJornada } from '../lib/titulares.js'

export default function Jornada() {
  const { id } = useParams()
  const [refresco, setRefresco] = useState(0)
  const { cargando, error, datos } = useAsync(() => getJornada(id), [id, refresco])

  // Mientras se juega, los cambios de marcador llegan por websocket y la tabla
  // se recoloca sola: nadie tiene que recargar el domingo por la tarde.
  useEffect(() => suscribirseAJornada(id, () => setRefresco(n => n + 1)), [id])

  if (cargando) return <Cargando filas={7} />
  if (error) return <AvisoError error={error} />
  if (!datos) return <Vacio>Esa jornada no existe.</Vacio>

  const { round, partidos, boletos, resumen } = datos
  const enJuego = round.estado === 'en_juego'
  const signos = partidos.slice(0, 14).map(m => m.signo ?? m.signo_provisional ?? null)
  const publicados = signos.filter(Boolean).length

  // Mientras la jornada no está liquidada no hay premio repartido, pero sí hay
  // dinero en juego. Enseñar 0,00 € haría pensar que no se juega nada.
  const liquidada = round.estado === 'finalizada'
  const recaudacion = resumen.recaudacion_cents ?? 0
  const premio = liquidada ? (resumen.premio_cents ?? 0) : Math.floor(recaudacion / 2)
  const alBote = liquidada ? (resumen.al_bote_cents ?? 0) : recaudacion - Math.floor(recaudacion / 2)

  return (
    <>
      <Portada
        antetitulo={
          <>
            <Link to="/jornadas" style={{ color: 'var(--rojo)' }}>Jornadas</Link>
            <span style={{ color: 'var(--tinta-3)' }}>/</span>
            <span style={{ color: 'var(--tinta-3)' }}>Jornada {round.numero}</span>
            {round.es_especial && <span className="etiqueta oro">Especial</span>}
          </>
        }
        titular={titularJornada(round, boletos, resumen)}
        entradilla={
          enJuego
            ? `Van ${publicados} de 14 partidos resueltos. Lo que ves es provisional: los signos no son oficiales hasta que Loterías publica el escrutinio.`
            : `Cerrada el ${fechaHora(round.cierra_at)}. ${boletos.length} boleto${boletos.length === 1 ? '' : 's'} en juego.`
        }
      >
        {!enJuego && (
          <div className="destacado">
            <Destacado rotulo="Premio de la jornada" valor={euros(premio)} tono="acento"
                       nota={boletos.length ? `Para quien más acertó` : 'Sin participantes'} />
            <Destacado rotulo="Al bote" valor={euros(alBote)} tono="oro"
                       nota="La otra mitad de lo recaudado" />
            <Destacado rotulo="Recaudado" valor={euros(recaudacion)}
                       nota={`${resumen.boletos ?? boletos.length} boletos`} />
          </div>
        )}
      </Portada>

      {resumen.bote_pagado_cents > 0 && (
        <div className="aviso" style={{ marginTop: 22 }}>
          <strong>Cayó el bote.</strong> Alguien clavó los catorce y se llevó también los{' '}
          {euros(resumen.bote_pagado_cents)} acumulados. El bote arranca de cero.
        </div>
      )}

      {/* ------------------------------------------------------------------
          MODO DIRECTO. Solo mientras se juega: fondo oscuro, monoespaciada y
          densidad alta, pensado para verse de lejos en la tele de la oficina.
          Una vez terminada la jornada vuelve al registro de prensa.
          ------------------------------------------------------------------ */}
      {enJuego ? (
        <div className="directo">
          <div className="barra">
            <span>Jornada {round.numero} · clasificación provisional</span>
            <span className="vivo"><span className="punto-vivo" />EN DIRECTO {String(publicados).padStart(2, '0')}/14</span>
          </div>

          <div className="marcadores">
            <div><div className="rotulo">Boletos</div><div className="valor">{boletos.length}</div></div>
            <div><div className="rotulo">Recaudado</div><div className="valor">{euros(recaudacion)}</div></div>
            <div><div className="rotulo">En juego</div><div className="valor lima">{euros(premio)}</div></div>
            <div><div className="rotulo">Al bote</div><div className="valor">{euros(alBote)}</div></div>
          </div>

          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>Participante</th>
                  <th className="num">Ac.</th>
                  <th>Columna</th>
                </tr>
              </thead>
              <tbody>
                {boletos.map((b, i) => (
                  <tr key={b.player_id}>
                    <td><Posicion n={i + 1} /></td>
                    <td><Persona nombre={b.nombre} mostrarInicial={false} /></td>
                    <td className="num" style={{ fontSize: 16, fontWeight: 500 }}>{b.aciertos}</td>
                    <td><TiraSignos picks={b.picks} signos={signos} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Seccion titulo="Cómo quedó" nota="Verde acertado, hueco fallado">
          {boletos.length === 0 ? (
            <Vacio>Nadie jugó esta jornada.</Vacio>
          ) : (
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}></th>
                    <th>Participante</th>
                    <th className="num">Aciertos</th>
                    <th>Columna</th>
                    <th className="num">Premio</th>
                  </tr>
                </thead>
                <tbody>
                  {boletos.map((b, i) => (
                    <tr key={b.player_id} className={i < 3 ? 'podio' : undefined}>
                      <td><Posicion n={i + 1} /></td>
                      <td>
                        <Link to={`/perfil/${b.player_id}`}>
                          <Persona nombre={b.nombre} />
                        </Link>
                      </td>
                      <td className="num destaca">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          {b.es_ganador && <Ganador />}{b.aciertos}
                        </span>
                      </td>
                      <td><TiraSignos picks={b.picks} signos={signos} /></td>
                      <td className="num">
                        {b.premio_cents ? <Dinero cents={b.premio_cents} conSigno /> : <span style={{ color: 'var(--tinta-3)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      )}

      <Seccion titulo="Los quince partidos"
               nota={enJuego ? `${publicados} resueltos` : 'Resultado oficial'}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>Nº</th>
                <th>Encuentro</th>
                <th className="num">Resultado</th>
                <th className="num" style={{ width: 60 }}>Signo</th>
              </tr>
            </thead>
            <tbody>
              {partidos.map(m => (
                <tr key={m.orden} style={m.orden === 15 ? { color: 'var(--tinta-3)' } : undefined}>
                  <td className="posicion">{String(m.orden).padStart(2, '0')}</td>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{m.local}</strong>
                    <span style={{ color: 'var(--tinta-3)', margin: '0 7px' }}>–</span>
                    <strong style={{ fontWeight: 500 }}>{m.visitante}</strong>
                    {m.orden === 15 && <span className="etiqueta" style={{ marginLeft: 10 }}>Pleno al 15 · no puntúa</span>}
                    {m.sustituido_de && <span className="etiqueta oro" style={{ marginLeft: 10 }}>Cambiado</span>}
                  </td>
                  <td className="num">
                    {m.goles_local != null ? `${m.goles_local} – ${m.goles_visitante}` : '—'}
                  </td>
                  <td className="num">
                    {m.orden === 15 ? '—'
                      : m.signo ? <span className="signo oficial">{m.signo}</span>
                      : m.signo_provisional ? <span className="signo" title="Provisional">{m.signo_provisional}</span>
                      : <span className="signo vacio">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {enJuego && (
        <Seccion titulo="Lo que hay en juego">
          <div className="cifras-menores">
            <CifraMenor rotulo="Recaudado" valor={euros(recaudacion)} />
            <CifraMenor rotulo="Premio estimado" valor={euros(premio)} tono="var(--rojo)" />
            <CifraMenor rotulo="Irá al bote" valor={euros(alBote)} tono="var(--oro)" />
          </div>
        </Seccion>
      )}
    </>
  )
}
