// Dónde dejó la persona el robot del estilista: `null` es su sitio de
// siempre, abajo a la derecha. Lo comparten el robot (al arrastrarlo) y el
// panel (que se abre del mismo lado). Se guarda en el navegador solo como
// comodidad: si el almacenamiento falla, el robot vuelve a su esquina.
export type Placement = { side: 'left' | 'right'; y: number } | null;

const STORAGE_KEY = 'airspace-stylist-robot';

export function readPlacement(): Placement {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { side?: unknown; y?: unknown };
    if ((parsed.side === 'left' || parsed.side === 'right') && typeof parsed.y === 'number') {
      return { side: parsed.side, y: parsed.y };
    }
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): a su sitio de siempre.
  }
  return null;
}

export function savePlacement(placement: Placement) {
  try {
    if (placement) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placement));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Que no se recuerde no rompe nada: la próxima visita vuelve a la esquina.
  }
}

// Margen al borde de la ventana (el mismo de Robot.module.css).
export const edgeMargin = () => (window.innerWidth >= 640 ? 24 : 16);
