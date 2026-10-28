import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroEnEnlace, esEnlaceCortoDeTiktok } from '../src/lib/tiktok.js'

test('saca el número del vídeo de las direcciones de TikTok', () => {
  assert.equal(numeroEnEnlace('https://www.tiktok.com/@laquiniela/video/7431234567890123456?is_from_webapp=1'), '7431234567890123456')
  assert.equal(numeroEnEnlace('https://www.tiktok.com/embed/v2/7431234567890123456'), '7431234567890123456')
  assert.equal(numeroEnEnlace('https://www.tiktok.com/player/v1/7431234567890123456'), '7431234567890123456')
  assert.equal(numeroEnEnlace('7431234567890123456'), '7431234567890123456')
})

test('el enlace corto no lleva el número, y otras webs no valen', () => {
  assert.equal(numeroEnEnlace('https://vm.tiktok.com/ZN8UrfAkG/'), null)
  assert.ok(esEnlaceCortoDeTiktok('https://vm.tiktok.com/ZN8UrfAkG/'))
  assert.equal(numeroEnEnlace('hola'), null)
})
