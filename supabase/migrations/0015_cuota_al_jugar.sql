-- ===========================================================================
-- 0015 · Jugar el boleto cobra la cuota en el momento
-- ===========================================================================
-- Las policies para que cada uno rellene su propia columna ya existían (0003:
-- bets_crea_la_suya y bets_edita_la_suya, con el plazo abierto y comprobando
-- el reloj de Postgres, no el del navegador). Lo que no había era el dinero:
-- la cuota solo aparecía al liquidar la jornada, así que entre que alguien
-- jugaba y se liquidaba, su deuda decía que no debía nada.
--
-- Ahora se apunta al jugar. Y se quita si retira el boleto: nadie debe una
-- jornada que no ha jugado.
--
-- Por qué un trigger y no hacerlo desde la app: `ledger` solo lo escribe el
-- administrador (ledger_admin_escribe). Un jugador no puede —ni debe poder—
-- meter apuntes en su propia caja; el trigger es security definer y cobra
-- exactamente lo que vale la columna, ni un céntimo más.
--
-- No pisa a recalcular_jornada: esa borra las cuotas de la jornada y las
-- vuelve a insertar igual, así que el resultado final es el mismo apunte. Solo
-- cambia CUÁNDO aparece.
-- ===========================================================================

create or replace function public.cobrar_cuota_del_boleto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_precio integer;
  v_numero integer;
begin
  -- Al retirar el boleto, o al dejarlo a medias, se devuelve la cuota.
  if tg_op = 'DELETE' or new.estado <> 'confirmada' then
    delete from ledger
     where round_id = coalesce(old.round_id, new.round_id)
       and player_id = coalesce(old.player_id, new.player_id)
       and tipo = 'cuota';
    return coalesce(new, old);
  end if;

  select coalesce(r.precio_override_cents, s.precio_columna_cents), r.numero
    into v_precio, v_numero
  from rounds r
  join seasons s on s.id = r.season_id
  where r.id = new.round_id;

  -- Un solo apunte por jornada y persona, pase lo que pase: editar la columna
  -- no vuelve a cobrar.
  if not exists (
    select 1 from ledger
     where round_id = new.round_id and player_id = new.player_id and tipo = 'cuota'
  ) then
    insert into ledger (player_id, round_id, tipo, importe_cents, nota)
    values (new.player_id, new.round_id, 'cuota', -v_precio,
            format('Cuota jornada %s', v_numero));
  end if;

  return new;
end;
$$;

drop trigger if exists bets_cobra_cuota on bets;
create trigger bets_cobra_cuota
  after insert or update or delete on bets
  for each row execute function public.cobrar_cuota_del_boleto();

comment on function public.cobrar_cuota_del_boleto is
  'Apunta la cuota en cuanto se confirma el boleto, y la retira si se borra. Idempotente: editar la columna no vuelve a cobrar.';
