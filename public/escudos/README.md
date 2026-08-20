# Escudos de equipo

Un PNG por equipo, nombrado con el `lae_id` numérico que LAE asigna a cada
club (el mismo que se guarda en `matches.lae_id_local` /
`matches.lae_id_visitante`):

```
public/escudos/{lae_id}.png
```

Por ejemplo, el Real Madrid tiene `idLocal: 12` en las respuestas de LAE
(ver `tests/fixtures/lae-sorteo-1308406028.json`), así que su escudo va en
`public/escudos/12.png`.

Se usa el `lae_id` y no el nombre porque LAE no siempre escribe el mismo
nombre para el mismo equipo ("At. Madrid" un año, "Atlético" otro), pero el
id numérico no cambia.

Si un equipo no tiene archivo aquí (recién ascendido, o simplemente no se ha
añadido todavía), la app no rompe: `Escudo` (`src/components/ui.jsx`) cae
automáticamente en un avatar con las iniciales del equipo.

Tamaño recomendado: cuadrado, fondo transparente, al menos 64×64.
