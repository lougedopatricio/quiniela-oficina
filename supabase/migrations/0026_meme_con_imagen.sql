-- ===========================================================================
-- 0026 · El meme de la jornada también puede ser una imagen
-- ===========================================================================
-- Además del TikTok (0024), el administrador puede subir una imagen. Se
-- guarda en el mismo bucket que las fotos de perfil (0016), en la carpeta
-- «meme/», que las policies de 0016 ya solo dejan escribir al administrador
-- (la primera carpeta no es la ficha de nadie).
--
-- Se guarda la dirección de la imagen, pero solo si es de ese sitio: por aquí
-- no se puede colar una imagen de otra web en la portada.
-- ===========================================================================

alter table seasons add column if not exists meme_imagen_url text;

alter table seasons drop constraint if exists seasons_meme_imagen_forma;
alter table seasons add constraint seasons_meme_imagen_forma
  check (meme_imagen_url is null
         or meme_imagen_url ~ '^https://[a-z0-9.-]+/storage/v1/object/public/avatares/meme/[A-Za-z0-9._-]+(\?v=[0-9]+)?$');

comment on column seasons.meme_imagen_url is
  'Imagen subida como «meme de la jornada» (bucket avatares, carpeta meme/). Si hay imagen y TikTok, sale la imagen.';
