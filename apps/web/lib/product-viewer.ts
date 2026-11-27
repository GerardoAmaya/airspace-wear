import type { Category } from '@airspace/contracts';

// Visor 3D de la ficha de producto.
// - 'turntable': plataforma giratoria del Hangar 360° (anillos HUD, giro lento
//   en bucle, arrastre horizontal y flechas). Solo gira sobre el eje vertical:
//   la suela no se ve desde abajo (decisión del dueño, 2026-11-27).
// - 'orbit': el visor anterior (ProductViewer): giro e inclinación libres,
//   con la cámara que viaja a cada detalle. Para volver a él basta con
//   cambiar PRODUCT_VIEWER a 'orbit'; su código sigue intacto.
export type ProductViewerKind = 'turntable' | 'orbit';

export const PRODUCT_VIEWER: ProductViewerKind = 'turntable';

// Categorías que usan la plataforma. La ropa se queda en el visor de órbita:
// una prenda de 0,5 a 1 m de alto (o unos lentes de 15 cm) no cabe en la
// plataforma pensada para un zapato de 0,30 m, y de frente se lee mejor.
const TURNTABLE_CATEGORIES: readonly Category[] = ['sneaker', 'cleat', 'ball'];

export function productViewerFor(category: Category): ProductViewerKind {
  return PRODUCT_VIEWER === 'turntable' && TURNTABLE_CATEGORIES.includes(category) ? 'turntable' : 'orbit';
}
