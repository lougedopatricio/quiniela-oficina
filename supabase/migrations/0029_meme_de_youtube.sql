-- ===========================================================================
-- 0029 · El meme de la jornada también puede ser un vídeo de YouTube
-- ===========================================================================
-- Como con TikTok (0024), solo se guarda el código del vídeo —los 11
-- caracteres que lleva cada enlace de YouTube— y la dirección del reproductor
-- la monta la portada, así que por aquí no se puede colar otra web.
--
-- `meme_youtube_vertical` dice si es un Short (vertical, 9:16) o un vídeo
-- normal (apaisado, 16:9), para darle al reproductor la forma que toca.
--
-- Un meme cada vez: la web, al poner uno, vacía los otros dos.
-- ===========================================================================

alter table seasons add column if not exists meme_youtube_id text;
alter table seasons add column if not exists meme_youtube_vertical boolean not null default false;

alter table seasons drop constraint if exists seasons_meme_youtube_forma;
alter table seasons add constraint seasons_meme_youtube_forma
  check (meme_youtube_id is null or meme_youtube_id ~ '^[A-Za-z0-9_-]{11}$');

comment on column seasons.meme_youtube_id is
  'Código del vídeo de YouTube que sale como «meme de la jornada» en la portada. NULL = no hay.';
