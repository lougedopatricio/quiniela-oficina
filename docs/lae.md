# Loterías y Apuestas del Estado como fuente de datos

Notas de la investigación hecha el **2026-08-14**. Son endpoints internos de la
web de LAE, sin contrato público ni documentación: pueden cambiar sin aviso. Si
la sincronización empieza a fallar, este documento es el punto de partida.

## El bloqueo de Akamai

Medido, no supuesto:

| Cliente | Resultado |
|---|---|
| `Invoke-WebRequest` con cabeceras completas de Chrome (UA, Accept, Referer, Origin) | **403** |
| `example.com` desde la misma máquina | 200 |
| `api.github.com` desde la misma máquina | 200 |
| Navegador real | **200** |
| `fetch` desde otro origen | **bloqueado, no hay CORS** |

La red está bien; el bloqueo es de LAE, y es por *fingerprinting* de TLS, no por
las cabeceras. Consecuencias:

1. Una Edge Function de Supabase con `fetch` **sería rechazada**. Por eso la
   ingesta vive en GitHub Actions con Playwright y un Chromium de verdad.
2. El navegador del admin **tampoco** puede llamar a LAE desde la app: sin CORS
   no hay atajo por cliente.
3. Hay que estar **en el sitio** antes de llamar a sus servicios: el script
   navega a `/es/quiniela` y lanza el `fetch` desde ese origen.

Si algún día endurecen la detección de headless, en orden de coste: `channel:
'chrome'` en el runner, luego `playwright-extra` con el plugin stealth, y como
último recurso la entrada manual desde el panel de admin —que sigue existiendo
precisamente para esto.

## Endpoints

### Jornadas celebradas · signos oficiales

```
GET /servicios/buscadorSorteos?game_id=LAQU&celebrados=true
    &fechaInicioInclusiva=AAAAMMDD&fechaFinInclusiva=AAAAMMDD
```

Es la fuente de verdad para puntuar. Devuelve un array de sorteos:

```jsonc
{
  "id_sorteo": "1308406028",
  "numero": 28,
  "fecha_sorteo": "2026-04-26 22:59:00",
  "premio_bote": "5000000",
  "combinacion": "X - 1 - 2 - ... - X - 00",   // 14 signos + Pleno al 15
  "escrutinio": [ /* categorías y ganadores de la quiniela nacional */ ],
  "partidos": [
    {
      "posicion": 1, "local": "Betis", "visitante": "Real Madrid",
      "idLocal": 11, "idVisitante": 12,
      "signo": "X ",            // ← ojo al espacio de relleno
      "marcador": "1 - 1",
      "fecha_completa": "2026-04-24 21:00:00"   // ← hora de Madrid, no UTC
    }
    // ... 15 en total
  ]
}
```

Dos trampas, las dos cubiertas por tests:

- **Los signos vienen con relleno**: `"X "`, `"1 "`. Hay que recortar.
- **La posición 15 es el Pleno al 15** y su `signo` no es un 1/X/2 sino un
  marcador (`"0-0"`). No puede colarse como un decimoquinto acierto.
- **Las fechas son hora peninsular**, sin zona. Interpretarlas como UTC
  desplazaría todos los horarios una o dos horas según la época del año.

Cuando no hay resultados, la respuesta **no es un array vacío** sino un string
con un mensaje. Hay que comprobar el tipo antes de iterar.

### Próximas jornadas · plazos

```
GET /servicios/proximosv3?game_id=LAQU&num=3
```

```jsonc
{
  "id_sorteo": "1319606046", "jornada": 1,
  "apertura": "2026-08-08 00:00:00",
  "cierre":   "2026-08-15 17:00:00",
  "estado": "abierto",
  "premio_bote": "1000000"
}
```

`apertura` y `cierre` son los plazos oficiales, así que los de nuestras jornadas
pueden sincronizarse solos en vez de fijarlos a mano. Las jornadas lejanas
traen ambos a `null`: en ese caso no se toca nada.

### Lo que NO existe

No se ha encontrado ningún endpoint JSON con la **alineación de la jornada
abierta** (los 14 partidos antes de jugarse). `buscadorSorteos` solo devuelve
celebradas; `partidosQuiniela`, `detalleSorteo`, `quiniela` y `resultquiniela`
dan 404. `fechasSorteos` también da 404.

Para la Fase 2 el plan es el editor de admin, que hace falta igualmente para las
jornadas especiales. Si algún día se quiere automatizar, la vía sería raspar el
DOM de la página de la quiniela, que carga por JavaScript.

## Cómo se recaptura un fixture

Los tests del parser corren contra una respuesta real guardada en
`tests/fixtures/`. Si LAE cambia el formato, se recaptura desde la consola de un
navegador **estando en loteriasyapuestas.es**:

```js
await (await fetch('/servicios/buscadorSorteos?game_id=LAQU&celebrados=true' +
  '&fechaInicioInclusiva=20260426&fechaFinInclusiva=20260426')).json()
```

y se sustituye el archivo. Los tests que se rompan señalan exactamente qué ha
cambiado.
