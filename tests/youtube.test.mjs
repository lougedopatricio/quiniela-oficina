import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoDeYoutube } from '../src/lib/youtube.js'
import { nuevaBase } from './helpers.mjs'

const ID = 'dQw4w9WgXcQ'

test('saca el código de todas las formas de enlace de YouTube', () => {
  const normal = { id: ID, vertical: false }
  assert.deepEqual(videoDeYoutube(`https://www.youtube.com/watch?v=${ID}`), normal)
  assert.deepEqual(videoDeYoutube(`https://youtube.com/watch?feature=share&v=${ID}&t=42s`), normal)
  assert.deepEqual(videoDeYoutube(`https://m.youtube.com/watch?v=${ID}`), normal)
  assert.deepEqual(videoDeYoutube(`https://youtu.be/${ID}?si=AbCdEfGh123`), normal)
  assert.deepEqual(videoDeYoutube(`youtu.be/${ID}`), normal)
  assert.deepEqual(videoDeYoutube(`https://www.youtube.com/embed/${ID}?start=10`), normal)
  assert.deepEqual(videoDeYoutube(`https://www.youtube-nocookie.com/embed/${ID}`), normal)
  assert.deepEqual(videoDeYoutube(`https://www.youtube.com/live/${ID}`), normal)
  assert.deepEqual(videoDeYoutube(`<iframe width="560" src="https://www.youtube.com/embed/${ID}?si=x" title="YouTube video player"></iframe>`), normal)
})

test('los Shorts salen en vertical', () => {
  assert.deepEqual(videoDeYoutube(`https://youtube.com/shorts/${ID}?si=abc`), { id: ID, vertical: true })
})

test('no confunde otras cosas con un vídeo de YouTube', () => {
  assert.equal(videoDeYoutube('https://www.tiktok.com/@a/video/7431234567890123456'), null)
  assert.equal(videoDeYoutube('https://www.youtube.com/@canal'), null)
  assert.equal(videoDeYoutube('https://www.youtube.com/watch?v=corto'), null)
  assert.equal(videoDeYoutube(`https://evil.com/?u=youtu.be/${ID}x`), null)
  assert.equal(videoDeYoutube(''), null)
})

test('la base solo guarda códigos de 11 caracteres', async () => {
  const db = await nuevaBase()
  const { rows: [s] } = await db.query(`insert into seasons (nombre, precio_columna_cents, activa) values ('T', 100, true) returning id`)
  await db.query(`update seasons set meme_youtube_id = $1, meme_youtube_vertical = true where id = $2`, [ID, s.id])
  await assert.rejects(db.query(`update seasons set meme_youtube_id = 'https://x.com' where id = $1`, [s.id]), /seasons_meme_youtube_forma/)
})
