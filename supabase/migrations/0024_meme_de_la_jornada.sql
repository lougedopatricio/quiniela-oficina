-- ===========================================================================
-- 0024 · El meme de la jornada
-- ===========================================================================
-- La portada enseña en un lateral un vídeo de TikTok que el administrador
-- cambia cuando quiere. Se guarda solo el NÚMERO del vídeo, no la dirección:
-- la portada construye ella misma la del reproductor oficial de TikTok
-- (www.tiktok.com/embed/v2/<número>), así que por aquí no se puede colar
-- ninguna otra web en la portada.
--
-- Va en la temporada porque es un dato único y de todos; las policies de
-- 0003 ya dejan leerla a cualquiera y escribirla solo al administrador.
-- ===========================================================================

alter table seasons add column if not exists meme_tiktok_id text;

alter table seasons drop constraint if exists seasons_meme_tiktok_forma;
alter table seasons add constraint seasons_meme_tiktok_forma
  check (meme_tiktok_id is null or meme_tiktok_id ~ '^[0-9]{8,25}$');

comment on column seasons.meme_tiktok_id is
  'Número del vídeo de TikTok que sale como «meme de la jornada» en la portada. NULL = no sale nada.';
