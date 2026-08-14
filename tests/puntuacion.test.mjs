import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nuevaBase, sembrarTemporada, crearJornada, apostar,
  columnaCon, recalcular, saldo, bote,
} from './helpers.mjs'

const TODO_UNOS = Array(14).fill('1')

test('las migraciones se aplican sobre un Postgres limpio', async () => {
  const db = await nuevaBase()
  const { rows } = await db.query(
    `select count(*)::int as n from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`
  )
  assert.equal(rows[0].n, 8, 'deberían existir las 8 tablas del esquema')
  await db.close()
})

test('ganador único: 50% al premio y 50% al bote', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })
  const r = await crearJornada(db, seasonId, 1, TODO_UNOS)

  await apostar(db, r, players.ana,   columnaCon(TODO_UNOS, 12))
  await apostar(db, r, players.bruno, columnaCon(TODO_UNOS, 10))
  await apostar(db, r, players.carla, columnaCon(TODO_UNOS, 8))

  const res = await recalcular(db, r)

  assert.equal(res.liquidada, true)
  assert.equal(res.recaudacion_cents, 600)
  assert.equal(res.premio_cents, 300)
  assert.equal(res.al_bote_cents, 300)
  assert.equal(res.max_aciertos, 12)
  assert.equal(res.ganadores, 1)

  // Ana paga 2 € y cobra 3 €.
  assert.equal(await saldo(db, players.ana), 100)
  assert.equal(await saldo(db, players.bruno), -200)
  assert.equal(await saldo(db, players.carla), -200)
  assert.equal(await bote(db, seasonId), 300)

  await db.close()
})

test('empate a tres: el resto de la división se reparte, no se pierde', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, {
    precio: 100, alias: ['ana', 'bruno', 'carla', 'diego', 'eva'],
  })
  const r = await crearJornada(db, seasonId, 1, TODO_UNOS)

  // Tres empatados a 11, dos por debajo.
  for (const a of ['ana', 'bruno', 'carla']) await apostar(db, r, players[a], columnaCon(TODO_UNOS, 11))
  await apostar(db, r, players.diego, columnaCon(TODO_UNOS, 9))
  await apostar(db, r, players.eva,   columnaCon(TODO_UNOS, 7))

  const res = await recalcular(db, r)

  assert.equal(res.recaudacion_cents, 500)
  assert.equal(res.premio_cents, 250)   // 250 entre 3 = 83 con resto 1
  assert.equal(res.ganadores, 3)

  const { rows } = await db.query(
    `select importe_cents::int as c from ledger where round_id = $1 and tipo = 'premio' order by importe_cents desc`,
    [r]
  )
  assert.deepEqual(rows.map(x => x.c), [84, 83, 83], 'el céntimo sobrante va a un ganador')
  assert.equal(rows.reduce((a, x) => a + x.c, 0), 250, 'lo repartido cuadra al céntimo con el premio')

  await db.close()
})

test('un 14/14 se lleva el bote y lo deja a cero', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })

  // Jornada 1: nadie hace pleno, el bote sube a 300.
  const r1 = await crearJornada(db, seasonId, 1, TODO_UNOS)
  await apostar(db, r1, players.ana,   columnaCon(TODO_UNOS, 12))
  await apostar(db, r1, players.bruno, columnaCon(TODO_UNOS, 10))
  await apostar(db, r1, players.carla, columnaCon(TODO_UNOS, 8))
  await recalcular(db, r1)
  assert.equal(await bote(db, seasonId), 300)

  // Jornada 2: Bruno clava los 14.
  const r2 = await crearJornada(db, seasonId, 2, TODO_UNOS)
  await apostar(db, r2, players.bruno, columnaCon(TODO_UNOS, 14))
  await apostar(db, r2, players.carla, columnaCon(TODO_UNOS, 9))
  const res = await recalcular(db, r2)

  assert.equal(res.max_aciertos, 14, 'el Pleno al 15 no suma un decimoquinto acierto')
  assert.equal(res.premio_cents, 200)
  assert.equal(res.bote_pagado_cents, 500, 'bote previo (300) + aporte de esta jornada (200)')
  assert.equal(await bote(db, seasonId), 0, 'el bote queda a cero')

  // Bruno: -200 (j1) -200 (j2) + 700 (premio 200 + bote 500) = 300
  assert.equal(await saldo(db, players.bruno), 300)

  await db.close()
})

test('es idempotente: recalcular diez veces no duplica nada', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })
  const r = await crearJornada(db, seasonId, 1, TODO_UNOS)
  await apostar(db, r, players.ana,   columnaCon(TODO_UNOS, 12))
  await apostar(db, r, players.bruno, columnaCon(TODO_UNOS, 10))
  await apostar(db, r, players.carla, columnaCon(TODO_UNOS, 8))

  for (let i = 0; i < 10; i++) await recalcular(db, r)

  const { rows: [l] } = await db.query(`select count(*)::int as n from ledger where round_id = $1`, [r])
  assert.equal(l.n, 4, '3 cuotas + 1 premio, pase lo que pase')
  assert.equal(await saldo(db, players.ana), 100)
  assert.equal(await bote(db, seasonId), 300)

  await db.close()
})

test('los pagos registrados a mano sobreviven a un recálculo', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })
  const r = await crearJornada(db, seasonId, 1, TODO_UNOS)
  await apostar(db, r, players.ana,   columnaCon(TODO_UNOS, 12))
  await apostar(db, r, players.bruno, columnaCon(TODO_UNOS, 10))
  await recalcular(db, r)

  // Bruno salda su deuda en mano.
  await db.query(
    `insert into ledger (player_id, round_id, tipo, importe_cents, nota)
     values ($1, $2, 'pago', 200, 'Pagado en efectivo')`,
    [players.bruno, r]
  )
  assert.equal(await saldo(db, players.bruno), 0)

  // Se corrige un signo y se vuelve a liquidar: el pago NO puede desaparecer.
  await recalcular(db, r)
  assert.equal(await saldo(db, players.bruno), 0, 'el pago en efectivo sigue ahí')

  await db.close()
})

test('un partido aplazado bloquea la liquidación en vez de repartir de más', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })
  const signos = [...TODO_UNOS]
  signos[6] = null   // séptimo partido aplazado, LAE aún no publica signo
  const r = await crearJornada(db, seasonId, 1, signos)

  await apostar(db, r, players.ana,   columnaCon(TODO_UNOS, 12))
  await apostar(db, r, players.bruno, columnaCon(TODO_UNOS, 10))

  const res = await recalcular(db, r)
  assert.equal(res.liquidada, false)
  assert.equal(res.motivo, 'faltan_signos')
  assert.equal(res.signos_publicados, 13)
  assert.equal(await saldo(db, players.ana), 0, 'no se ha cobrado ninguna cuota')
  assert.equal(await bote(db, seasonId), 0)

  // Llega el signo que faltaba y se liquida sola.
  await db.query(`update matches set signo = '1' where round_id = $1 and orden = 7`, [r])
  const res2 = await recalcular(db, r)
  assert.equal(res2.liquidada, true)
  assert.equal(res2.recaudacion_cents, 400)

  await db.close()
})

test('la auditoría de la temporada cuadra al céntimo', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, {
    precio: 150, alias: ['ana', 'bruno', 'carla', 'diego', 'eva', 'fran', 'gema'],
  })
  const todos = Object.keys(players)

  for (let j = 1; j <= 4; j++) {
    const r = await crearJornada(db, seasonId, j, TODO_UNOS)
    for (const [i, a] of todos.entries()) {
      // La jornada 3 provoca un pleno para ejercitar también el vaciado del bote.
      const ac = j === 3 && i === 0 ? 14 : 5 + ((i + j) % 8)
      await apostar(db, r, players[a], columnaCon(TODO_UNOS, ac))
    }
    await recalcular(db, r)
  }

  const { rows } = await db.query(`select * from auditar_temporada($1)`, [seasonId])
  assert.equal(rows.length, 4)
  for (const f of rows) {
    assert.equal(Number(f.descuadre_cents), 0, `la jornada ${f.numero} descuadra`)
  }

  // Nada se evapora: lo recaudado en total = lo entregado + lo que queda en el bote.
  const { rows: [g] } = await db.query(`
    select coalesce(-sum(importe_cents) filter (where tipo = 'cuota'), 0)::int  as recaudado,
           coalesce( sum(importe_cents) filter (where tipo = 'premio'), 0)::int as premios
    from ledger`)
  assert.equal(g.recaudado, g.premios + await bote(db, seasonId))

  await db.close()
})

test('una columna confirmada no puede quedar a medias', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, TODO_UNOS)

  const incompleta = [...TODO_UNOS]; incompleta[3] = '-'
  await assert.rejects(
    () => apostar(db, r, players.ana, incompleta),
    /bets_confirmada_completa/,
    'la base rechaza confirmar una columna con huecos'
  )

  await assert.rejects(
    () => apostar(db, r, players.ana, Array(13).fill('1')),
    /bets_picks_forma/,
    'la base rechaza una columna que no tenga 14 signos'
  )

  await db.close()
})
