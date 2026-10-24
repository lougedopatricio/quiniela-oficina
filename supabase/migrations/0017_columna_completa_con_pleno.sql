-- ===========================================================================
-- 0017 · Una columna completa es la que tiene todo lo que puntúa
-- ===========================================================================
-- `bets_confirmada_completa` (0001) exigía que no hubiera ni un solo '-' en
-- `picks`. Tenía sentido con 14 partidos fijos. Desde 0013 no:
--
--   · El Pleno al 15 con resultado exigido —el caso por defecto— no se juega
--     con un signo sino con `pleno_local` y `pleno_visitante`. Su hueco en
--     `picks` se queda en '-' a propósito.
--   · Un partido marcado como «no puntúa» tampoco lleva signo.
--
-- Así que la base rechazaba justo las columnas bien hechas: tanto la que echa
-- cada uno desde «Jugar» como la que mete el administrador en «Boletos»,
-- siempre que la jornada tuviera el pleno activo.
--
-- Un CHECK no puede mirar la tabla `matches`, así que la regla pasa a un
-- trigger que sí sabe qué partidos puntúan por signo. Lo demás no cambia: una
-- columna confirmada sigue sin poder quedar a medias.
--
-- Los goles del pleno NO se exigen aquí. El Excel no los trae, y una columna
-- importada sin ellos es válida: simplemente no puede llevarse el bote. Las
-- pantallas de «Jugar» y «Boletos» sí los piden.
-- ===========================================================================

alter table bets drop constraint if exists bets_confirmada_completa;

create or replace function public.bets_columna_completa() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falta smallint;
begin
  if new.estado <> 'confirmada' then
    return new;
  end if;

  if exists (select 1 from matches where round_id = new.round_id) then
    -- El primer partido que puntúa por signo y no lo tiene. Los que caen más
    -- allá de la longitud de `picks` (una columna de 14 con el 15 jugándose
    -- por signo) se dejan pasar, como antes de 0013: ese partido no puntúa
    -- para esa columna y ya está.
    select m.orden into v_falta
      from matches m
     where m.round_id = new.round_id
       and m.modo_puntuacion <> 'no_puntua'
       and not (m.modo_puntuacion = 'pleno' and m.exige_resultado)
       and m.orden <= array_length(new.picks, 1)
       and new.picks[m.orden] = '-'
     order by m.orden
     limit 1;
  else
    -- Jornada todavía sin partidos: la regla de siempre sobre los 14.
    select i into v_falta
      from generate_series(1, least(14, array_length(new.picks, 1))) i
     where new.picks[i] = '-'
     limit 1;
  end if;

  if v_falta is not null then
    -- El nombre de la regla vieja va en el mensaje para que quien ya lo
    -- buscara (tests, avisos de la interfaz) lo siga encontrando.
    raise exception 'Columna incompleta: falta el signo del partido % (bets_confirmada_completa)', v_falta
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists bets_columna_completa on bets;
create trigger bets_columna_completa
  before insert or update on bets
  for each row execute function public.bets_columna_completa();
