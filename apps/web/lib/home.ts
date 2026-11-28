// Configuración de la home. La portada la eligió el dueño del proyecto: el
// Jordan 4 Travis Scott (cambiar aquí para otra portada). Su acento violeta
// viene del producto en la API (acento por producto).
export const HOME_HERO = {
  slug: 'jordan-4-travis-scott',
  // Titular en dos líneas (la segunda entra como contorno y se rellena).
  headline: ['Jordan 4', 'Travis Scott'] as const,
};

// Par que gira en el adelanto "zapato" del Hangar 360° de la home (elegido
// por el dueño del proyecto). Si no está en el catálogo, se usa el primer
// destacado. Solo cuenta con HOME_HANGAR_TEASER en 'shoe'.
export const HOME_HANGAR_SLUG = 'jordan-4-university-blue';

// Secciones de la home que se pueden ocultar sin borrarlas. Todo sigue en el
// código (componentes, mensajes es/en y pruebas, que se saltan con la sección
// oculta): para volver a mostrar una, poner su valor en true.
export const HOME_SECTIONS = {
  // "Estilista IA" (#estilista, la consola con el guion). El robot flotante
  // la reemplaza: abre el mismo chat en cualquier página. Oculta, el enlace
  // "Estilista IA" sin JS lleva al catálogo (ver StylistLink).
  stylist: false,
} as const;

// Adelanto del Hangar 360° en la home:
// - 'avatar': el maniquí del Hangar camina con el look de fábrica (la
//   camiseta base gris, el short negro y el Air Jordan 1, DEFAULT_OUTFIT) sobre
//   la plataforma (HangarAvatarTeaser).
// - 'shoe': el adelanto anterior, el par de HOME_HANGAR_SLUG girando solo
//   en la plataforma (HangarTeaser). Para volver a él: 'shoe'.
// Sin avatar publicado (HANGAR_ENABLED en false) se usa 'shoe' siempre.
export const HOME_HANGAR_TEASER: 'avatar' | 'shoe' = 'avatar';

// Anclas de las secciones de la home (en español, ver COPY.md).
export const HOME_ANCHORS = {
  hero: 'inicio',
  board: 'catalogo',
  apparel: 'ropa',
  hangar: 'hangar',
  balls: 'balones',
  stylist: 'estilista',
  club: 'club',
} as const;
