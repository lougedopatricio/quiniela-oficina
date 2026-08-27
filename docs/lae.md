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
  "id_sorteo": "1320306047",
  "numero": 47,                 // ← sorteo del año, NO la jornada de liga
  "jornada": "2",               // ← esta sí, y llega como texto
  "temporada": "2026-2027",
  "fecha_sorteo": "2026-08-23 23:24:00",
  "premio_bote": "1100000",
  "combinacion": "2 - X - 2 - ... - 1 - 22",   // 14 signos + Pleno al 15
  "escrutinio": [ /* categorías y ganadores de la quiniela nacional */ ],
  "partidos": [
    {
      "posicion": 1,
      "local": "Athletic Club (m)",   // ← sufijo de categoría desde 08/2026
      "visitante": "Sevilla (m)",
      "idLocal": 1, "idVisitante": 17,
      "signo": "2 ",            // ← ojo al espacio de relleno
      "marcador": "1 - 3",
      "fecha_completa": "2026-08-22 17:00:00"   // ← hora de Madrid, no UTC
    }
    // ... 15 en total
  ]
}
```

El `id` numérico de cada equipo (`idLocal`, `idVisitante`) es lo único estable
que hay: LAE escribe el mismo club de varias formas —`"Racing Santander (m)"`
y `"Racing De Santander (m)"` conviven en la misma respuesta— pero el id no
cambia. Por eso los escudos se guardan como `public/escudos/{id}.png`.

Trampas, todas cubiertas por tests:

- **Los signos vienen con relleno**: `"X "`, `"1 "`. Hay que recortar.
- **La posición 15 es el Pleno al 15** y su `signo` no es un 1/X/2 sino un
  marcador (`"0-0"`). No puede colarse como un decimoquinto acierto.
- **Las fechas son hora peninsular**, sin zona. Interpretarlas como UTC
  desplazaría todos los horarios una o dos horas según la época del año.
- **Los nombres de equipo llevan el sufijo `" (m)"`** desde agosto de 2026:
  `"Athletic Club (m)"`, `"Sevilla (m)"`. Lo lleva todo equipo español; los
  extranjeros de las quinielas de verano, no. `limpiarNombreEquipo()` lo quita
  al entrar. Con el sufijo pegado, el nombre deja de casar con la tabla de
  equipos y **no se resuelve ni un solo escudo**, que es exactamente lo que
  pasó. Un `"(f)"` sí se respeta: ahí distinguiría un partido distinto.
- **`numero` y `jornada` no son lo mismo.** `numero` es el sorteo dentro del
  año (47) y `jornada` la de liga (2). `jornada` apareció en algún momento
  entre abril y agosto de 2026 —y llega como texto, `"2"`—; es la que
  corresponde a `lae_jornada`, porque es la que lee `proximosv3`. Antes se
  guardaba `numero` y el mismo campo significaba una cosa distinta según por
  qué endpoint hubiera entrado la jornada.

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

### La jornada abierta: no hay JSON, pero sí DOM

Comprobado otra vez el **2026-08-27**: sigue sin haber ningún endpoint JSON con
los 15 partidos de la jornada **abierta**. `buscadorSorteos` solo devuelve
celebradas y con `celebrados=false` responde 406; `partidosQuiniela`,
`detalleSorteo` y `fechasSorteosQuiniela` dan 404.

Pero los partidos **sí están publicados**, en el DOM de la página donde se
juega:

```
https://juegos.loteriasyapuestas.es/jugar/la-quiniela/apuesta/
```

Cada uno es un `.nombre-partido-completo` con el texto `"Local (M) - Visitante (M)"`.
`partidosDeJornadaAbierta()` los parsea, y el editor de admin trae los 15 de
una vez pegándolos (rellena el formulario; no guarda hasta que se confirma).

Ojo con dos cosas:

- **Es otro subdominio** (`juegos.`), así que no comparte origen con
  `/servicios` y el comando de la consola hay que ejecutarlo estando en esa
  página, no en la de resultados.
- **Hay partidos femeninos.** La jornada 3 de 2026-2027 traía cuatro, con
  sufijo `(F)`. Por eso `limpiarNombreEquipo()` quita el `(M)` pero conserva el
  `(F)`: si no, "Real Madrid (M) – Málaga" y "Real Madrid (F) – At. Madrid"
  quedarían indistinguibles en la tabla.

### Sobre los 406

El 406 de `proximosv3?game_id=LAQU` estaba anotado como permanente desde el
2026-08-16. Midiéndolo el 2026-08-27 se ve que es otra cosa: LAQU respondió 200
al principio de la sesión y 406 al cabo de un rato, y para entonces
`buscadorSorteos` daba 406 también con la misma llamada que había funcionado
diez minutos antes, desde la misma página.

Es **Akamai estrangulando por volumen de peticiones**, no un problema del
`game_id` ni de la página desde la que se llama. La respuesta correcta es
reintentar más tarde. El cron, que llama unas pocas veces al día, no debería
verlo casi nunca.

### La página de entrada

`/es/quiniela` —la que usaba el script— devuelve **404** desde algún momento
anterior al 2026-08-27: una página vacía con el título sin resolver
(`"... - {1}"`). Los fetch seguían saliendo porque el origen es el mismo y a
Akamai le da igual, así que el fallo era invisible; lo que sí estaba roto era
el enlace que se le enseñaba al administrador. Ahora se entra por
`/es/resultados/quiniela`, que responde 200 con contenido de verdad, y
`sync-lae.mjs` avisa en el log si esa navegación deja de funcionar.

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
