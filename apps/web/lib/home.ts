// Configuración de la home. La portada la eligió el dueño del proyecto: el
// Jordan 4 Travis Scott (cambiar aquí para otra portada). Su acento violeta
// viene del producto en la API (acento por producto).
export const HOME_HERO = {
  slug: 'jordan-4-travis-scott',
  // Titular en dos líneas (la segunda entra como contorno y se rellena).
  headline: ['Jordan 4', 'Travis Scott'] as const,
};

// Anclas de las secciones de la home (en español, ver COPY.md).
export const HOME_ANCHORS = {
  hero: 'inicio',
  board: 'catalogo',
  hangar: 'hangar',
  balls: 'balones',
  stylist: 'estilista',
  club: 'club',
} as const;
