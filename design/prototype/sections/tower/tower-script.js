// Guion de la consola del estilista con IA. En el sitio real la respuesta la
// escribe la IA (en el idioma del visitante) y estos textos pasan a los
// archivos de mensajes; aquí son fijos para mostrar el tono y el ritmo.
//
// En "answer", lo que va entre corchetes se resalta como nombre de producto.

export const SCENARIOS = [
  {
    id: 'comfort',
    chip: 'Busco comodidad para todo el día',
    question: 'Necesito algo cómodo para caminar todo el día por la ciudad.',
    answer:
      '¡Claro! Para caminar todo el día te recomiendo dos pares: las [New Balance 997], con amortiguación ENCAP y gamuza que abraza el pie, y las [Adidas Samba], ligeras y de perfil bajo para moverte sin pensar en tus pies.',
    picks: [
      { slug: 'new-balance-997', match: 97, reason: 'Amortiguación ENCAP que aguanta de la mañana a la noche.' },
      { slug: 'adidas-samba', match: 91, reason: 'Solo 340 g y perfil bajo para caminar ligero.' },
    ],
  },
  {
    id: 'concert',
    chip: 'Quiero destacar en un concierto',
    question: 'Voy a un concierto este sábado y quiero destacar.',
    answer:
      '¡Buen plan! Para que te vean desde la última fila: las [Nike Air Uptempo], con letras AIR gigantes y cámara de aire visible, y las [Air Jordan 1], el clásico de bota alta que nunca pasa desapercibido.',
    picks: [
      { slug: 'nike-air-uptempo', match: 96, reason: 'Letras AIR que se leen desde el escenario.' },
      { slug: 'air-jordan-1', match: 92, reason: 'Bota alta icónica en negro y vela.' },
    ],
  },
  {
    id: 'basic',
    chip: 'Busco un básico fácil de combinar',
    question: 'Busco un básico que combine con todo mi clóset.',
    answer:
      'Tengo justo lo que buscas: las [Adidas Sambae], cuero blanco con franjas verdes y suela de goma que van con jeans, joggers o pantalón de vestir. Si prefieres algo más bajo y oscuro, las [Adidas Samba] son tu segunda opción.',
    picks: [
      { slug: 'adidas-sambae', match: 97, reason: 'Blanco versátil que combina con todo tu clóset.' },
      { slug: 'adidas-samba', match: 90, reason: 'Minimalista, de los jeans al pantalón de vestir.' },
    ],
  },
];

// Respuesta a cualquier mensaje escrito por el visitante en la demo.
export const FREE_REPLY =
  '¡Gracias por escribir! En esta demo mis respuestas vienen preparadas, pero en el sitio real tu estilista usa IA y responde cualquier pregunta sobre el catálogo, en tu idioma. Mientras tanto, prueba una de las ideas de abajo.';
