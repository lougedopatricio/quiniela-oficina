-- ===========================================================================
-- 0028 · Cómo marca cada uno sus casillas
-- ===========================================================================
-- En el boleto de papel cada uno tiene su manía: una cruz, un círculo, tachar
-- la casilla entera… En «Jugar» la casilla elegida se dibuja con la marca de
-- cada participante. La elige el administrador, ficha a ficha; quien no tiene
-- ninguna marca con la cruz de siempre.
--
-- Es solo cómo se ve: los signos se siguen guardando igual en `bets.picks`.
-- ===========================================================================

alter table players add column if not exists marca text;

alter table players drop constraint if exists players_marca_valida;
alter table players add constraint players_marca_valida check (marca is null or marca in (
  'cruz', 'circulo', 'tachon', 'relleno', 'check', 'estrella', 'pez',
  'corazon', 'balon', 'rayo', 'corona', 'carita', 'gato', 'garabato'
));

comment on column players.marca is
  'Cómo se dibuja la casilla marcada en «Jugar». NULL = la cruz. La elige el administrador.';

grant select (marca) on players to anon, authenticated;

-- La elige el administrador: quien edita su propio perfil (apodo, foto) no
-- puede cambiársela por su cuenta.
create or replace function public.players_marca_solo_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marca is distinct from old.marca
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Solo el administrador puede cambiar la marca de las casillas';
  end if;
  return new;
end;
$$;

drop trigger if exists players_marca_solo_admin on players;
create trigger players_marca_solo_admin
  before update of marca on players
  for each row execute function public.players_marca_solo_admin();
