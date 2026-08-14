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

- Cada persona juega **una columna** por jornada, a un precio fijo.
- Puntúan los **14 partidos**. El Pleno al 15 no cuenta.
- **50 %** de lo recaudado va a quien más acierte, **a partes iguales** si hay empate.
- **50 %** va al bote. El céntimo impar de una recaudación impar va al bote.
- Un **14/14** se lleva además el bote entero y lo deja a cero.
- Bote sin reventar al final de temporada → cena.

Todo esto vive en un único sitio:
[`supabase/migrations/0004_puntuacion.sql`](supabase/migrations/0004_puntuacion.sql).
Si algún día cambiáis las reglas, se cambian ahí y en ningún otro lado.

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
navegador real** — comprobado con cabeceras completas de Chrome, mientras que
example.com y api.github.com desde la misma máquina responden 200. Tampoco
manda cabeceras CORS, así que el navegador del admin tampoco puede llamarlo
desde la app. La única vía fiable es un Chromium de verdad. Detalles y
endpoints en [`docs/lae.md`](docs/lae.md).

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
2. En el **SQL Editor**, ejecuta en orden los cuatro archivos de
   `supabase/migrations/`.
3. Crea la temporada y tu usuario admin:

```sql
insert into seasons (nombre, precio_columna_cents, activa)
values ('Temporada 26/27', 200, true);          -- 2,00 € la columna

insert into players (nombre, alias, email, is_admin)
values ('Tu Nombre', 'tualias', 'tu@empresa.com', true);
```

4. Añade al resto de la oficina (sin `is_admin`). Cuando cada uno entre con su
   correo, enlaza su cuenta:

```sql
update players p set user_id = u.id
from auth.users u where u.email = p.email and p.user_id is null;
```

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

### 4 · Primera sincronización

**Actions → Sincronizar con Loterías (LAE) → Run workflow**, indicando el rango
de fechas que quieras recuperar (`20260801` – `20260831`). A partir de ahí va
sola por cron.

---

## El día a día

| Cuándo | Qué haces |
|---|---|
| Recoges los boletos | Los pasas a un Excel (hay plantilla descargable en la propia app) |
| Antes de que se jueguen | *Importar* → eliges jornada → subes el Excel → revisas la previsualización → importas |
| Domingo noche | Nada. El cron trae los signos y la jornada se liquida sola |
| Cuando alguien te paga | Apuntas el movimiento y su saldo se actualiza |

El importador **no escribe nada hasta que confirmas**: enseña cada fila con sus
problemas señalados (nombre que no cuadra, signo inválido, columna incompleta,
persona repetida) y solo importa las correctas.

---

## Tests

```bash
npm test
```

53 tests. Los que de verdad importan:

- **`tests/puntuacion.test.mjs`** — levanta un Postgres real (PGlite, sin Docker),
  aplica las cuatro migraciones y comprueba el reparto: ganador único, empate a
  tres con céntimo sobrante, pleno que revienta el bote, partido aplazado que
  bloquea la liquidación, idempotencia, y que un pago en efectivo sobrevive a un
  recálculo.
- **`tests/espejo.test.mjs`** — las reglas están implementadas dos veces (PL/pgSQL
  y JS para la previsualización). Este test ejecuta ambas sobre los mismos casos
  y compara céntimo a céntimo, que es como se evita que se separen.
- **`tests/lae.test.mjs`** — parsea una respuesta **real** de LAE guardada en
  `tests/fixtures/`. Si LAE cambia el formato, aquí se ve.

---

## Estado

**Fase 1 — hecha.** Histórico, clasificación, jornadas, perfiles, saldos, bote,
importador de Excel, ingesta de LAE, autenticación por magic link.

**Fase 2 — pendiente.** Rellenar la quiniela online con plazos y cuenta atrás,
jornadas especiales, deuda automática al cerrar, clasificación en vivo con
marcadores, avisos por correo a quien no ha rellenado.

**Fase 3 — ideas.** «La Liga según X» (simular la clasificación real con los
pronósticos de cada uno), estadísticas de la oficina (el más valiente, el
borreguito, el más casero), cara a cara, palmarés y logros, contador de la cena,
modo espectador para la tele del domingo.
