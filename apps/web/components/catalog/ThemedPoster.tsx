import styles from './ThemedPoster.module.css';

// Miniatura de 600 px que pnpm models:posters genera junto a cada póster.
const thumbnail = (src: string) => src.replace(/\.webp$/, '-600.webp');

// Póster con la luz de cada tema. Solo se muestra (y se descarga) el del
// tema activo: el otro queda con display: none y carga diferida.
// Todos los pósters miden 1200 x 800 (pnpm models:posters): el ancho y alto
// reservan la proporción exacta para que nada salte al cargar.
// Con `sizes` (miniaturas: catálogo, banda de balones) se ofrece también la
// versión de 600 px y el navegador elige la que basta para su pantalla.
export function ThemedPoster({
  poster,
  alt,
  className,
  eager = false,
  sizes,
  width = 1200,
  height = 800,
}: {
  poster: { dark: string; light: string };
  alt: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
}) {
  const loading = eager ? 'eager' : 'lazy';
  const srcSet = (src: string) => (sizes ? `${thumbnail(src)} 600w, ${src} 1200w` : undefined);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster.dark} srcSet={srcSet(poster.dark)} sizes={sizes} alt={alt} className={`${styles.dark} ${className ?? ''}`} loading={loading} decoding="async" width={width} height={height} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster.light} srcSet={srcSet(poster.light)} sizes={sizes} alt={alt} className={`${styles.light} ${className ?? ''}`} loading="lazy" decoding="async" width={width} height={height} />
    </>
  );
}
