# La Quiniela de la Oficina

Clasificación, historial, saldos y bote de la quiniela de la oficina. Web
estática en GitHub Pages, base de datos en Supabase, resultados oficiales de
Loterías y Apuestas del Estado. Coste: 0 €.

**Arranca sin configurar nada.** Si no hay Supabase conectado, la app entra en
modo demo con una temporada de ejemplo generada aplicando las reglas de reparto
de verdad. Sirve para enseñarla en la oficina antes de montar el backend.

```bash
npm install
npm run dev
```

---

## Las reglas

- Cada persona juega **una columna** por jornada, a un precio fijo. La cuota se
  apunta a su cuenta en cuanto la echa.
- Puntúan **los 14 partidos y el Pleno al 15**, que suma como uno más.
- **50 %** de lo recaudado va a quien más acierte, **a partes iguales** si hay empate.
- **50 %** va al bote. El céntimo impar de una recaudación impar va al bote.
- **Acertarlo todo** —pleno incluido— se lleva además el bote entero y lo deja a cero.
- Bote sin reventar al final de temporada → cena.

**Cada partido se puede configurar**, jornada a jornada, desde *Redacción →
Jornadas → Partidos*:

| Cómo puntúa | Qué hace |
|---|---|
| `normal` | Un 1/X/2 como cualquier otro |
| `pleno` | Cuenta igual **y** es el que abre el bote |
| `no puntúa` | Ni cuenta ni abre nada |

Y el pleno admite dos formas de acertarse: **el resultado exacto** (0, 1, 2 o M
para cada equipo, como el boleto oficial) o **solo quién gana**. Por defecto va
como la quiniela oficial; lo demás está para la jornada rara.

Todo esto vive en un único sitio:
[`supabase/migrations/0013_pleno_al_15.sql`](supabase/migrations/0013_pleno_al_15.sql),
que reemplaza la función de reparto original de
[`0004`](supabase/migrations/0004_puntuacion.sql). Si algún día cambiáis las
reglas, se cambian ahí y en ningún otro lado.

### Quién manda

- **Dueño.** Reparte y retira el administrador. Nadie puede degradarlo, ni
  borrarlo, ni dejar la quiniela sin ninguno.
- **Administrador.** Todo el panel: jornadas, boletos, caja, participantes. Lo
  que no puede es tocar roles — ni los suyos ni los de nadie.
- **Jugador.** Echa su columna mientras el plazo esté abierto y ve su caja.

Así ceder el panel a alguien de la oficina es reversible, que es justo lo que no
era cuando `is_admin` era plano.

---

## Cómo está montado

```
GitHub Pages (React + Vite)  ──lee──►  Supabase (Postgres + Auth + Realtime)
                                              ▲
GitHub Actions + Playwright ──escribe─────────┘
        └── descarga de LAE los partidos y los signos oficiales
```

**Por qué Playwright y no una Edge Function.** `loteriasyapuestas.es` está
detrás de Akamai y devuelve **403 a cualquier cliente HTTP que no sea un
navegador real**. Tampoco manda cabeceras CORS, así que el navegador del admin
tampoco puede llamarlo desde la app.

**Y aun así no basta.** Akamai bloquea además el **rango de IP** de los runners
de GitHub: 13 de 13 ejecuciones seguidas terminaron en 403, con Chromium y con
Chrome de verdad, mientras el mismo endpoint responde 200 desde una IP
doméstica. Cambiar de navegador no lo arregla porque no es cuestión de
navegador. Está todo medido en [`docs/lae.md`](docs/lae.md), junto con las
salidas que quedan (pegar a mano, runner self-hosted o proxy).

### Decisiones que conviene no deshacer sin pensarlo

- **El dinero, en céntimos enteros.** Nunca `float`. Un reparto de 12,50 € entre
  3 tiene que sumar exactamente 12,50 €, y el céntimo que sobra se reparte en
  vez de perderse.
- **Los saldos y el bote no se guardan: se calculan** sumando movimientos. No
  puede haber un total desincronizado del que nadie sepa el porqué.
- **Un jugador no es una cuenta.** El admin puede cargar los boletos de gente
  que aún no se ha registrado; el día que entren, se enlaza su usuario.
- **Que nadie vea la columna de otro con la jornada abierta va en RLS**, no en
  la interfaz. Si dependiera de ocultarlo en pantalla, se saltaría desde la
  consola del navegador.

---

## Puesta en marcha

### 1 · Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. En el **SQL Editor**, ejecuta **en orden** todos los archivos de
   `supabase/migrations/`, del `0001` al último. Cada uno da por hecho el
   anterior.
3. Crea la temporada y tu usuario admin:

```sql
insert into seasons (nombre, precio_columna_cents, activa)
values ('Temporada 26/27', 200, true);          -- 2,00 € la columna

insert into players (nombre, alias, email, is_admin)
values ('Tu Nombre', 'tualias', 'tu@empresa.com', true);
```

4. Añade al resto de la oficina (sin `is_admin`) desde **Redacción →
   Participantes**. Las cuentas se enlazan solas en cuanto los correos
   coinciden, den de alta antes o después de que la persona entre por primera
   vez. Si alguien entra con un correo que no está en la lista, aparece en
   **Cuentas sin participante** para darle de alta o enlazarlo a una ficha que
   ya exista.

### 2 · Variables

En **Settings → Secrets and variables → Actions** del repo de GitHub:

| Secret | De dónde sale | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | Settings → API → Project URL | build del frontend |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → anon public | build del frontend |
| `SUPABASE_URL` | igual que la primera | ingesta de LAE |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | ingesta de LAE |

> La `anon key` es **pública** por diseño: viaja dentro del bundle publicado y
> cualquiera puede leerla. La seguridad está entera en las policies RLS. La que
> no puede salir nunca de los secrets es la **`service_role`**, porque se salta
> RLS: jamás en una variable `VITE_*`.

Para desarrollo local, copia `.env.example` a `.env.local`.

### 3 · GitHub Pages

**Settings → Pages → Source: GitHub Actions.** Con el primer push a `main` se
publica solo.

### 4 · Los partidos y los resultados

La sincronización automática **está rota por el bloqueo de IP** descrito arriba,
así que hoy los partidos entran a mano y funciona bien:

**Redacción → Jornadas → Partidos → "Traer los equipos de LAE de una vez".** Da
las instrucciones en pantalla y admite pegar tanto desde la página oficial como
desde TuLotero — esta segunda hace falta cuando hay una jornada entre semana por
delante, porque LAE solo enseña la que está en juego.

Si algún día se desbloquea, **Actions → Sincronizar con Loterías (LAE) → Run
workflow** sigue ahí, con el rango de fechas a recuperar.

---

## El día a día

| Cuándo | Qué haces |
|---|---|
| Sale la jornada nueva | *Jornadas → Partidos* → traes los equipos y abres la jornada |
| Durante la semana | Nada. Cada uno echa su columna desde *Jugar*, y su cuota se apunta sola |
| Quien no entre en la web | Su boleto se carga a mano (*Boletos*) o por Excel (*Importar*) |
| Domingo noche | Metes los signos en *Partidos*. Con todos puestos, la jornada se liquida sola |
| Cuando alguien te paga | Apuntas el movimiento y su saldo se actualiza |

Lo del domingo sería automático si la sincronización con LAE no estuviera
bloqueada; mientras tanto, los signos se meten a mano igual que los partidos.

El importador **no escribe nada hasta que confirmas**: enseña cada fila con sus
problemas señalados (nombre que no cuadra, signo inválido, columna incompleta,
persona repetida) y solo importa las correctas.

---

## Tests

```bash
npm test
```

171 tests. Los que de verdad importan:

- **`tests/puntuacion.test.mjs`** — levanta un Postgres real (PGlite, sin Docker),
  aplica las migraciones y comprueba el reparto: ganador único, empate a
  tres con céntimo sobrante, pleno que revienta el bote, partido aplazado que
  bloquea la liquidación, idempotencia, y que un pago en efectivo sobrevive a un
  recálculo.
- **`tests/espejo.test.mjs`** — las reglas están implementadas dos veces (PL/pgSQL
  y JS para la previsualización). Este test ejecuta ambas sobre los mismos casos
  y compara céntimo a céntimo, que es como se evita que se separen. Corre contra
  **todas** las migraciones, no contra las primeras: cuando solo aplicaba cuatro,
  estuvo un tiempo comparando con una función de reparto que ya no existía.
- **`tests/pleno.test.mjs`** — que el Pleno al 15 suma, que 14 ya no basta para
  el bote, que la "M" cubre tres goles o más, y que se puede dejar cualquier
  partido sin puntuar.
- **`tests/owner.test.mjs`** — con sesiones simuladas de verdad: que un
  administrador no puede degradar al dueño, ni repartirse permisos, ni dejar la
  quiniela sin dueño.
- **`tests/cuota.test.mjs`** — que jugar el boleto cobra la cuota en el momento
  y que liquidar después **no la duplica**.
- **`tests/cara-a-cara.test.mjs`** — misma idea: la ventaja que el cara a cara
  cuenta en los partidos donde dos columnas discrepan tiene que explicar
  exactamente la diferencia de aciertos que puntuó la base.
- **`tests/cuentas.test.mjs`** — que registrarse y darse de alta enganchen en
  los dos sentidos, que un correo desconocido **no** se cuele como
  participante, y que la vista de cuentas sueltas no enseñe correos a quien no
  es administrador.
- **`tests/lae.test.mjs`** — parsea una respuesta **real** de LAE guardada en
  `tests/fixtures/`. Si LAE cambia el formato, aquí se ve.

---

## Estado

**Fase 1 — hecha.** Histórico, clasificación, jornadas, perfiles, saldos, bote,
importador de Excel, ingesta de LAE, autenticación por magic link.

**Fase 2 — casi entera.** Hecho: rellenar la quiniela online con plazo y cuenta
atrás, la cuota apuntada al jugar, el Pleno al 15 configurable, la evolución de
la clasificación, el cara a cara, y los escudos de los equipos. Queda el aviso
por correo a quien no ha rellenado.

> **La sincronización automática con LAE no funciona**, y no es culpa del
> código: Akamai bloquea con 403 el rango de IP de los runners de GitHub. Está
> medido en [`docs/lae.md`](docs/lae.md), con lo que se probó y lo que queda por
> probar. Mientras tanto, los partidos se pegan a mano desde *Redacción →
> Jornadas*, que funciona porque sale de la IP del administrador.

**Fase 3 — ideas.** «La Liga según X» (simular la clasificación real con los
pronósticos de cada uno), estadísticas de la oficina (el más valiente, el
borreguito, el más casero), cara a cara, palmarés y logros, contador de la cena,
modo espectador para la tele del domingo.
