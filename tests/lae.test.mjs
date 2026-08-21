import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalizarSorteo, normalizarProximo, limpiarSigno, parsearMarcador, fechaMadrid, esFinDeSemana, signoDeMarcador, URLS } from '../scripts/lae.mjs'

const aquí = dirname(fileURLToPath(import.meta.url))
const sorteoReal = JSON.parse(await readFile(join(aquí, 'fixtures', 'lae-sorteo-1308406028.json'), 'utf8'))

test('los signos vienen con relleno y hay que limpiarlos', () => {
  assert.equal(limpiarSigno('X '), 'X')
  assert.equal(limpiarSigno('1 '), '1')
  assert.equal(limpiarSigno('  2  '), '2')
  // El "signo" del Pleno al 15 es un marcador, no un 1/X/2.
  assert.equal(limpiarSigno('0-0'), null)
  assert.equal(limpiarSigno(''), null)
  assert.equal(limpiarSigno(undefined), null)
})

test('marcadores', () => {
  assert.deepEqual(parsearMarcador('2 - 1'), { local: 2, visitante: 1 })
  assert.deepEqual(parsearMarcador('0 - 0'), { local: 0, visitante: 0 })
  // Un partido sin jugar o aplazado no trae marcador.
  assert.deepEqual(parsearMarcador(''), { local: null, visitante: null })
  assert.deepEqual(parsearMarcador('Aplazado'), { local: null, visitante: null })
})

test('el marcador implica un signo, y sin marcador no hay signo', () => {
  assert.equal(signoDeMarcador(2, 1), '1')
  assert.equal(signoDeMarcador(0, 3), '2')
  assert.equal(signoDeMarcador(1, 1), 'X')
  assert.equal(signoDeMarcador(0, 0), 'X')
  // Un partido sin jugar o aplazado no deduce nada.
  assert.equal(signoDeMarcador(null, null), null)
  assert.equal(signoDeMarcador(2, null), null)
  assert.equal(signoDeMarcador(null, 2), null)
})

test('el provisional se deduce del marcador; el oficial NUNCA', () => {
  // Un partido ya jugado del que LAE todavía no ha publicado el escrutinio:
  // trae marcador pero el signo viene vacío. Es la ventana —a veces de
  // horas— en la que la clasificación en vivo tiene que moverse igual.
  const sinEscrutinio = {
    id_sorteo: '1', numero: 1, fecha_sorteo: '2026-04-26 22:59:00',
    partidos: [
      { posicion: 1, local: 'A', visitante: 'B', signo: '  ', marcador: '2 - 1' },
      { posicion: 2, local: 'C', visitante: 'D', signo: '  ', marcador: '0 - 0' },
      { posicion: 3, local: 'E', visitante: 'F', signo: '  ', marcador: '' },
    ],
  }
  const s = normalizarSorteo(sinEscrutinio)

  assert.deepEqual(s.partidos.map(p => p.signo), [null, null, null],
    'sin escrutinio no puede haber signo oficial: es el que reparte el dinero')
  assert.deepEqual(s.partidos.map(p => p.signo_provisional), ['1', 'X', null],
    'el provisional sí sale del marcador, y el partido sin jugar se queda a null')
  assert.equal(s.completa, false)
})

test('el Pleno al 15 tampoco deduce signo provisional', () => {
  const p15 = normalizarSorteo(sorteoReal).partidos.find(p => p.orden === 15)
  assert.equal(p15.signo, null)
  assert.equal(p15.signo_provisional, null,
    'el 15 tiene marcador pero su signo no es un 1/X/2 que puntúe')
})

test('las horas de LAE son de Madrid, no UTC', () => {
  // 24 de abril: España está en horario de verano, UTC+2.
  assert.equal(fechaMadrid('2026-04-24 21:00:00'), '2026-04-24T19:00:00.000Z')
  // 15 de enero: horario de invierno, UTC+1.
  assert.equal(fechaMadrid('2026-01-15 21:00:00'), '2026-01-15T20:00:00.000Z')
  assert.equal(fechaMadrid(null), null)
})

test('un sorteo real de LAE se normaliza entero', () => {
  const s = normalizarSorteo(sorteoReal)

  assert.equal(s.lae_id_sorteo, '1308406028')
  assert.equal(s.lae_jornada, 28)
  assert.equal(s.partidos.length, 15)
  assert.equal(s.completa, true, 'los 14 signos están publicados')
  assert.equal(s.lae_bote_cents, 500000000, '5.000.000 € en céntimos')

  const primero = s.partidos[0]
  assert.equal(primero.local, 'Betis')
  assert.equal(primero.visitante, 'Real Madrid')
  assert.equal(primero.signo, 'X')
  assert.equal(primero.goles_local, 1)
  assert.equal(primero.goles_visitante, 1)
  assert.equal(primero.kickoff_at, '2026-04-24T19:00:00.000Z')
  assert.equal(primero.estado, 'finalizado')

  // Los 14 signos normalizados tienen que coincidir con la combinación
  // oficial que LAE publica por separado. Si esto falla, o el parser está
  // mal o LAE cambió el formato.
  const oficial = sorteoReal.combinacion.split('-').map(x => x.trim()).slice(0, 14)
  assert.deepEqual(s.partidos.filter(p => p.orden <= 14).map(p => p.signo), oficial)
})

test('el Pleno al 15 se guarda pero nunca como signo puntuable', () => {
  const s = normalizarSorteo(sorteoReal)
  const pleno = s.partidos.find(p => p.orden === 15)
  assert.equal(pleno.local, 'Espanyol')
  assert.equal(pleno.signo, null, 'su "0-0" no puede colarse como un acierto más')
  assert.equal(pleno.goles_local, 0)
})

test('una jornada a medias no se marca como completa', () => {
  const aplazada = structuredClone(sorteoReal)
  aplazada.partidos[6].signo = '  '
  aplazada.partidos[6].marcador = ''
  const s = normalizarSorteo(aplazada)

  assert.equal(s.completa, false)
  assert.equal(s.partidos[6].signo, null)
  assert.equal(s.partidos[6].estado, 'pendiente')
})

test('proximosv3 da los plazos de apertura y cierre', () => {
  // Payload real capturado el 2026-08-14.
  const p = normalizarProximo({
    fecha: '2026-08-16 00:00:00', id_sorteo: '1319606046', game_id: 'LAQU',
    apertura: '2026-08-08 00:00:00', cierre: '2026-08-15 17:00:00',
    estado: 'abierto', jornada: 1,
  })

  assert.equal(p.lae_id_sorteo, '1319606046')
  assert.equal(p.lae_jornada, 1)
  assert.equal(p.cierra_at, '2026-08-15T15:00:00.000Z', '17:00 de Madrid en agosto = 15:00 UTC')
  assert.equal(p.lae_estado, 'abierto')
})

test('una jornada futura sin plazos publicados no inventa fechas', () => {
  const p = normalizarProximo({
    fecha: '2026-08-23 00:00:00', id_sorteo: '1320306047',
    apertura: null, cierre: null, estado: 'cerrado', jornada: 2,
  })
  assert.equal(p.abre_at, null)
  assert.equal(p.cierra_at, null)
})

test('proximosv3 pide TODOS los productos, no solo LAQU', () => {
  // game_id=LAQU en este endpoint concreto empezó a dar 406 el 2026-08-16,
  // de forma repetida. game_id=TODOS es la única vía que funciona; quien
  // consuma la respuesta tiene que filtrar game_id === 'LAQU' a mano.
  assert.match(URLS.proximos(3), /game_id=TODOS/)
  assert.doesNotMatch(URLS.proximos(3), /game_id=LAQU/)
})

test('fin de semana distingue la jornada de Liga de las intersemanales', () => {
  // Domingo 23 de agosto de 2026: jornada de Liga normal.
  assert.equal(esFinDeSemana('2026-08-23T17:00:00.000Z'), true)
  // Sábado también cuenta.
  assert.equal(esFinDeSemana('2026-08-22T17:00:00.000Z'), true)
  // Miércoles: entre semana, típico de una jornada intersemanal de Champions.
  assert.equal(esFinDeSemana('2026-08-19T17:00:00.000Z'), false)
  // Sin fecha todavía (LAE no ha publicado el sorteo): se deja pasar, se
  // filtrará en cuanto haya fecha.
  assert.equal(esFinDeSemana(null), true)
})
