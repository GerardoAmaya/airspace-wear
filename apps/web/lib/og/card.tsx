import { ImageResponse } from 'next/og';
import { loadFonts, loadPalette, type OgPalette } from './assets';

// Tarjeta para compartir (1200x630, el tamaño que piden Open Graph y X) con
// el estilo Flight Deck: fondo de marca oscuro, cuadrícula HUD, halo de
// estudio detrás del zapato, esquinas en lima y datos en mono. La dibuja
// ImageResponse (Satori): solo flexbox y estilos en línea, sin variables CSS.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const PAD = 64;
const GRID = 70;
// Columna del texto; el zapato ocupa el resto.
const TEXT_WIDTH = 540;

export type OgCardProps = {
  // Texto pequeño en mono, arriba del título.
  kicker: string;
  // Título grande (el nombre del producto); null pone el logo en grande.
  title: string | null;
  titleSize: number;
  // Línea debajo del título (descripción o marca).
  subtitle?: string;
  // Dato destacado al pie (el precio) en lima.
  highlight?: string;
  // Póster del zapato (data URL) o null para la versión sin zapato.
  poster: string | null;
  // Dominio del sitio, al pie.
  host: string;
  // Logo de la tienda (textos de messages, Brand); arriba a la izquierda salvo
  // que el título ya sea el logo.
  brand: OgBrand;
  showLogo?: boolean;
};

export type OgBrand = { name: string; suffix: string };

export function OgLogo({ palette, brand, size }: { palette: OgPalette; brand: OgBrand; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.3 }}>
      <span style={{ fontFamily: 'display', fontWeight: 800, fontSize: size, letterSpacing: '-0.01em', color: palette.text }}>{brand.name}</span>
      <span style={{ fontFamily: 'body', fontWeight: 700, fontSize: size * 0.62, color: palette.primary }}>{brand.suffix}</span>
    </div>
  );
}

// Esquinas HUD (como .frameCorners del sitio) alrededor del zapato.
function Corners({ palette, box }: { palette: OgPalette; box: { left: number; top: number; width: number; height: number } }) {
  const arm = 26;
  const line = `3px solid ${palette.primary}`;
  const corner = (style: Record<string, number | string>) => <div style={{ position: 'absolute', width: arm, height: arm, ...style }} />;
  const { left, top, width, height } = box;
  return (
    <div style={{ position: 'absolute', left, top, width, height, display: 'flex' }}>
      {corner({ left: 0, top: 0, borderLeft: line, borderTop: line })}
      {corner({ right: 0, top: 0, borderRight: line, borderTop: line })}
      {corner({ left: 0, bottom: 0, borderLeft: line, borderBottom: line })}
      {corner({ right: 0, bottom: 0, borderRight: line, borderBottom: line })}
    </div>
  );
}

// Cuadrícula de fondo: líneas finas con opacidad baja (Satori no tiene color-mix).
function Grid({ palette }: { palette: OgPalette }) {
  const columns = Array.from({ length: Math.ceil(OG_SIZE.width / GRID) }, (_, index) => (index + 1) * GRID);
  const rows = Array.from({ length: Math.ceil(OG_SIZE.height / GRID) }, (_, index) => (index + 1) * GRID);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', opacity: 0.07 }}>
      {columns.map((x) => (
        <div key={`x${x}`} style={{ position: 'absolute', left: x, top: 0, width: 1, height: OG_SIZE.height, backgroundColor: palette.text }} />
      ))}
      {rows.map((y) => (
        <div key={`y${y}`} style={{ position: 'absolute', top: y, left: 0, height: 1, width: OG_SIZE.width, backgroundColor: palette.text }} />
      ))}
    </div>
  );
}

export async function renderOgCard({ kicker, title, titleSize, subtitle, highlight, poster, host, brand, showLogo = true }: OgCardProps): Promise<ImageResponse> {
  const [palette, fonts] = await Promise.all([loadPalette(), loadFonts()]);
  const stage = { left: TEXT_WIDTH + PAD, top: PAD, width: OG_SIZE.width - TEXT_WIDTH - PAD * 2, height: OG_SIZE.height - PAD * 2 };

  return new ImageResponse(
    (
      <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', backgroundColor: palette.background, color: palette.text, fontFamily: 'body' }}>
        <Grid palette={palette} />

        {/* Halo de estudio detrás del zapato (más claro que el fondo, como .stage-halo). */}
        <div
          style={{
            position: 'absolute',
            left: stage.left - 120,
            top: -40,
            width: stage.width + 240,
            height: OG_SIZE.height + 80,
            display: 'flex',
            backgroundImage: `radial-gradient(circle at 50% 50%, ${palette.surfaceRaised} 0%, ${palette.surface} 35%, transparent 68%)`,
          }}
        />

        {poster ? (
          <div style={{ position: 'absolute', left: stage.left, top: stage.top, width: stage.width, height: stage.height, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
            {/* El póster trae aire alrededor del zapato: se dibuja más grande que el marco. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse solo acepta <img> */}
            <img src={poster} alt="" width={Math.round(stage.width * 1.25)} height={Math.round(stage.height * 1.25)} style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          // Sin póster: el logo en grande ocupa el lugar del zapato.
          <div style={{ position: 'absolute', left: stage.left, top: stage.top, width: stage.width, height: stage.height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9 }}>
            <OgLogo palette={palette} brand={brand} size={44} />
          </div>
        )}
        <Corners palette={palette} box={stage} />

        <div style={{ position: 'absolute', left: PAD, top: PAD, width: TEXT_WIDTH - PAD / 2, height: OG_SIZE.height - PAD * 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {showLogo ? <OgLogo palette={palette} brand={brand} size={34} /> : <div style={{ display: 'flex' }} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', fontFamily: 'mono', fontWeight: 500, fontSize: 20, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.primary }}>{kicker}</div>
            {title === null ? (
              <OgLogo palette={palette} brand={brand} size={titleSize} />
            ) : (
              <div style={{ display: 'flex', fontFamily: 'display', fontWeight: 800, fontSize: titleSize, lineHeight: 0.95, textTransform: 'uppercase', color: palette.text }}>{title}</div>
            )}
            {subtitle ? <div style={{ display: 'flex', fontSize: 26, lineHeight: 1.35, color: palette.textMuted }}>{subtitle}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            {highlight ? (
              <div style={{ display: 'flex', fontFamily: 'mono', fontWeight: 500, fontSize: 44, color: palette.primary }}>{highlight}</div>
            ) : (
              <div style={{ display: 'flex', width: 120, height: 3, backgroundColor: palette.primary }} />
            )}
            <div style={{ display: 'flex', fontFamily: 'mono', fontWeight: 500, fontSize: 16, letterSpacing: '0.08em', color: palette.textFaint }}>{host}</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}

// Tamaño del título según su largo: los nombres largos bajan de cuerpo para
// caber en dos o tres líneas de la columna de texto.
export function titleSizeFor(text: string): number {
  if (text.length <= 12) return 76;
  if (text.length <= 20) return 60;
  if (text.length <= 30) return 50;
  return 42;
}
