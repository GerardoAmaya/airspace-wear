// Catálogo semilla de AIRSPACE Wear: fuente de verdad de los productos.
// Portado de design/prototype/core/catalog.js; el texto en inglés se redactó
// aparte (no es traducción literal) y lo revisa el dueño del proyecto.
// /add-product agrega productos aquí, siempre con es y en.
//
// Precios y datos técnicos son ilustrativos (proyecto de portafolio).

import type { Availability, Category, Locale } from '@airspace/contracts';

export type { Locale };

export interface ProductText {
  name: string;
  colorway?: string;
  tagline: string;
  description: string;
  edition?: string;
  hostCity?: string;
  materials: Record<string, string>;
  tags: string[];
}

export interface SeedProduct {
  slug: string;
  reference: string;
  category: Category;
  brand: string;
  priceCents: number;
  availability: Availability;
  // Rango de tallas: EU para sneakers; los balones son talla 5.
  // attributes.hostCountry: país sede (ISO 3166 alfa-3) en los balones.
  sizes: { system: 'EU'; from: number; to: number } | { system: 'BALL'; labels: string[] };
  attributes: Record<string, string | number | boolean>;
  // Slug del modelo en assets/models/manifest.json (si tiene 3D).
  model?: string;
  // Acento del visor (marco, halo, "En foco"): tinta para el tema oscuro y
  // para el claro, ambas AA (lo comprueba el seed). Sin acento: el lima de
  // la marca. Propuesta aprobada en design/prototype/dev/accents.html.
  accent?: { dark: string; light: string };
  text: Record<Locale, ProductText>;
}

// Vitrina: los favoritos del dueño van primero, en este orden; el resto
// conserva el orden de PRODUCTS (los balones al final). Define sortOrder.
export const FEATURED: readonly string[] = ['jordan-4-travis-scott', 'nike-dunk-high-hawaii', 'adidas-prophere', 'adidas-gazelle', 'nike-air-uptempo', 'jordan-4-university-blue'];

export const BRANDS = [
  { slug: 'nike', name: 'Nike' },
  { slug: 'new-balance', name: 'New Balance' },
  { slug: 'adidas', name: 'Adidas' },
] as const;

export const PRODUCTS: SeedProduct[] = [
  {
    slug: 'air-jordan-1',
    reference: 'AS-001',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 18000,
    availability: 'new',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: { weightGrams: 450, stackMm: 32 },
    model: 'air-jordan-1',
    text: {
      es: {
        name: 'Air Jordan 1',
        colorway: 'Negro y vela',
        tagline: 'El clásico de caña alta que cambió las canchas y las calles.',
        description:
          'Corte alto de cuero con el Swoosh superpuesto y el logo Wings en el tobillo. Puntera perforada, cuello acolchado y suela de goma con círculo de pivote: el mismo diseño que pasó del básquet a la calle.',
        materials: { upper: 'Cuero', sole: 'Goma' },
        tags: ['clásico', 'caña alta', 'icónico'],
      },
      en: {
        name: 'Air Jordan 1',
        colorway: 'Black and sail',
        tagline: 'The high-top classic that changed both the court and the street.',
        description:
          'A leather high-top with an overlaid Swoosh and the Wings logo at the ankle. Perforated toe, padded collar and a rubber outsole with a pivot circle: the same design that moved from basketball to the street.',
        materials: { upper: 'Leather', sole: 'Rubber' },
        tags: ['classic', 'high-top', 'iconic'],
      },
    },
  },
  {
    slug: 'new-balance-997',
    reference: 'AS-997',
    category: 'sneaker',
    brand: 'new-balance',
    priceCents: 20000,
    availability: 'available',
    sizes: { system: 'EU', from: 39, to: 46 },
    attributes: { weightGrams: 380, stackMm: 30 },
    model: 'new-balance-997',
    accent: { dark: '#94a3b8', light: '#636d7b' },
    text: {
      es: {
        name: 'New Balance 997',
        colorway: 'Gris y naranja',
        tagline: 'Comodidad de corredor con ADN de los 90 para todo el día.',
        description:
          'Gamuza y malla sobre una media suela con amortiguación ENCAP, pensada para correr y adoptada para caminar la ciudad. Un perfil retro que combina con casi todo.',
        materials: { upper: 'Gamuza y malla', sole: 'ENCAP' },
        tags: ['comodidad', 'retro', 'diario'],
      },
      en: {
        name: 'New Balance 997',
        colorway: 'Gray and orange',
        tagline: 'Runner comfort with 90s DNA, made for all-day wear.',
        description:
          'Suede and mesh over an ENCAP cushioned midsole, built for running and adopted for walking the city. A retro profile that goes with almost anything.',
        materials: { upper: 'Suede and mesh', sole: 'ENCAP' },
        tags: ['comfort', 'retro', 'everyday'],
      },
    },
  },
  {
    slug: 'nike-air-uptempo',
    reference: 'AS-096',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 19000,
    availability: 'available',
    sizes: { system: 'EU', from: 40, to: 47 },
    attributes: { weightGrams: 520, stackMm: 38 },
    model: 'nike-air-uptempo',
    text: {
      es: {
        name: 'Nike Air More Uptempo',
        colorway: 'Negro y blanco',
        tagline: 'Letras AIR gigantes y amortiguación visible para destacar.',
        description:
          'Nació en la cancha de básquet de los 90 y se quedó en la calle por su volumen: letras AIR a lo largo del lateral y unidades de aire visibles en toda la suela.',
        materials: { upper: 'Cuero', sole: 'Air de longitud completa' },
        tags: ['llamativo', 'básquet', 'amortiguación'],
      },
      en: {
        name: 'Nike Air More Uptempo',
        colorway: 'Black and white',
        tagline: 'Giant AIR letters and visible cushioning that stand out.',
        description:
          'Born on 90s basketball courts and still on the street thanks to its bold volume: AIR lettering along the side and visible air units across the whole sole.',
        materials: { upper: 'Leather', sole: 'Full-length Air' },
        tags: ['bold', 'basketball', 'cushioning'],
      },
    },
  },
  {
    slug: 'adidas-samba',
    reference: 'AS-050',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 10000,
    availability: 'new',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: { weightGrams: 340, stackMm: 22 },
    model: 'adidas-samba',
    text: {
      es: {
        name: 'Adidas Samba',
        colorway: 'Negro y blanco',
        tagline: 'Perfil bajo, tres franjas y suela de goma: elegancia futbolera.',
        description:
          'Un tenis de perfil bajo con puntera de gamuza, tres franjas y suela de goma natural. Nació como tenis de entrenamiento de fútbol y hoy acompaña tanto a unos jeans como a un traje.',
        materials: { upper: 'Cuero y gamuza', sole: 'Goma natural' },
        tags: ['perfil bajo', 'minimalista', 'tendencia'],
      },
      en: {
        name: 'Adidas Samba',
        colorway: 'Black and white',
        tagline: 'Low profile, three stripes and a gum sole: football-born elegance.',
        description:
          'A low-profile sneaker with a suede toe, three stripes and a natural gum sole. It began as a football training shoe and now goes as well with jeans as with a suit.',
        materials: { upper: 'Leather and suede', sole: 'Natural gum' },
        tags: ['low profile', 'minimal', 'trending'],
      },
    },
  },
  {
    slug: 'adidas-sambae',
    reference: 'AS-055',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 11000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 36, to: 42 },
    attributes: { weightGrams: 410, stackMm: 36 },
    model: 'adidas-sambae',
    accent: { dark: '#f59e0b', light: '#956007' },
    text: {
      es: {
        name: 'Adidas Sambae',
        colorway: 'Blanco, verde y goma',
        tagline: 'La Samba sube a plataforma: cuero blanco, franjas verdes y goma translúcida.',
        description:
          'La silueta de la Samba sobre una plataforma de goma translúcida que deja ver su textura. Cuero blanco, franjas verdes y lengüeta larga para un look de los 2000.',
        materials: { upper: 'Cuero', sole: 'Goma translúcida' },
        tags: ['plataforma', 'tendencia', 'clásico renovado'],
      },
      en: {
        name: 'Adidas Sambae',
        colorway: 'White, green and gum',
        tagline: 'The Samba goes platform: white leather, green stripes and a translucent gum sole.',
        description:
          'The Samba silhouette on a translucent gum platform that shows off its texture. White leather, green stripes and a long tongue for a 2000s look.',
        materials: { upper: 'Leather', sole: 'Translucent gum' },
        tags: ['platform', 'trending', 'reworked classic'],
      },
    },
  },
  {
    slug: 'adidas-prophere',
    reference: 'AS-212',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 12000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: { weightGrams: 430, stackMm: 40 },
    model: 'adidas-prophere',
    accent: { dark: '#c2b280', light: '#746b4d' },
    text: {
      es: {
        name: 'Adidas Prophere',
        colorway: 'Negro, naranja y camuflaje',
        tagline: 'Suela robusta y parte superior de punto: volumen que no pasa desapercibido.',
        description:
          'Una media suela de EVA texturizada, ancha y marcada, con una parte superior de punto que se ajusta al pie. Hecho para quien quiere que sus tenis se noten.',
        materials: { upper: 'Malla de punto', sole: 'EVA texturizada' },
        tags: ['suela gruesa', 'urbano', 'llamativo'],
      },
      en: {
        name: 'Adidas Prophere',
        colorway: 'Black, orange and camo',
        tagline: 'A chunky sole and a knit upper: volume that gets noticed.',
        description:
          'A wide, sculpted textured EVA midsole with a knit upper that hugs the foot. Made for anyone who wants their sneakers to be seen.',
        materials: { upper: 'Knit mesh', sole: 'Textured EVA' },
        tags: ['chunky sole', 'streetwear', 'bold'],
      },
    },
  },
  {
    slug: 'adidas-gazelle',
    reference: 'AS-066',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 10000,
    availability: 'available',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: { weightGrams: 350, stackMm: 22 },
    model: 'adidas-gazelle',
    accent: { dark: '#22c55e', light: '#157c3b' },
    text: {
      es: {
        name: 'Adidas Gazelle',
        colorway: 'Verde y blanco',
        tagline: 'Gamuza verde y tres franjas blancas: el clásico de 1966 que nunca se fue.',
        description:
          'Gamuza suave, tres franjas blancas y suela de goma delgada. Una silueta de entrenamiento de los 60 que sigue igual de vigente.',
        materials: { upper: 'Gamuza', sole: 'Goma' },
        tags: ['clásico', 'gamuza', 'perfil bajo'],
      },
      en: {
        name: 'Adidas Gazelle',
        colorway: 'Green and white',
        tagline: 'Green suede and three white stripes: the 1966 classic that never left.',
        description:
          'Soft suede, three white stripes and a slim rubber sole. A 1960s training silhouette that still feels current.',
        materials: { upper: 'Suede', sole: 'Rubber' },
        tags: ['classic', 'suede', 'low profile'],
      },
    },
  },
  {
    slug: 'adidas-basketball',
    reference: 'AS-330',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 13000,
    availability: 'new',
    sizes: { system: 'EU', from: 39, to: 48 },
    attributes: { weightGrams: 480, stackMm: 34 },
    model: 'adidas-basketball',
    accent: { dark: '#ec4899', light: '#ba3979' },
    text: {
      es: {
        name: 'Adidas Basketball',
        colorway: 'Rosa, morado y blanco',
        tagline: 'Tenis de básquet de caña alta con soporte y colores que se ven desde la tribuna.',
        description:
          'Corte alto con soporte en el tobillo, parte superior de sintético y malla y una suela de goma de alta tracción para frenar y arrancar en la cancha.',
        materials: { upper: 'Sintético y malla', sole: 'Goma de alta tracción' },
        tags: ['básquet', 'caña alta', 'color'],
      },
      en: {
        name: 'Adidas Basketball',
        colorway: 'Pink, purple and white',
        tagline: 'A high-support basketball shoe in colors you can spot from the stands.',
        description:
          'A high-top with ankle support, a synthetic and mesh upper and a high-traction rubber sole for quick stops and starts on court.',
        materials: { upper: 'Synthetic and mesh', sole: 'High-traction rubber' },
        tags: ['basketball', 'high-top', 'color'],
      },
    },
  },
  {
    slug: 'air-jordan-1-mid-particle-beige',
    reference: 'AS-011',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 15500,
    availability: 'new',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: { weightGrams: 420, stackMm: 30 },
    model: 'air-jordan-1-mid-particle-beige',
    accent: { dark: '#eab308', light: '#886805' },
    text: {
      es: {
        name: 'Air Jordan 1 Mid',
        colorway: 'Beige, mostaza y negro',
        tagline: 'La silueta del Jordan 1 en caña media, con gamuza y tonos tierra.',
        description:
          'Caña media con paneles de gamuza beige, Swoosh negro y cuello color mostaza con el logo Wings. Cordones color crema y suela de goma con círculo de pivote para usarlos todos los días.',
        materials: { upper: 'Gamuza y cuero', sole: 'Goma' },
        tags: ['caña media', 'tonos tierra', 'gamuza'],
      },
      en: {
        name: 'Air Jordan 1 Mid',
        colorway: 'Beige, mustard and black',
        tagline: 'The Jordan 1 silhouette at mid height, in suede and earthy tones.',
        description:
          'A mid-top with beige suede panels, a black Swoosh and a mustard collar carrying the Wings logo. Cream laces and a rubber outsole with a pivot circle make it an easy everyday pair.',
        materials: { upper: 'Suede and leather', sole: 'Rubber' },
        tags: ['mid-top', 'earth tones', 'suede'],
      },
    },
  },
  {
    slug: 'jordan-4-university-blue',
    reference: 'AS-404',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 21000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: { weightGrams: 530, stackMm: 34 },
    model: 'jordan-4-university-blue',
    accent: { dark: '#60a5fa', light: '#3f6da5' },
    text: {
      es: {
        name: 'Jordan 4 Retro University Blue',
        colorway: 'Azul, gris y negro',
        tagline: 'Gamuza azul, malla a la vista y detalles en gris moteado.',
        description:
          'Parte superior de gamuza azul con paneles de malla y soportes laterales en gris moteado. En el talón, una unidad de aire visible sobre una media suela blanca y negra.',
        materials: { upper: 'Gamuza y malla', sole: 'Goma con Air visible' },
        tags: ['básquet', 'gamuza', 'retro'],
      },
      en: {
        name: 'Jordan 4 Retro University Blue',
        colorway: 'Blue, grey and black',
        tagline: 'Blue suede, exposed mesh and speckled grey details.',
        description:
          'A blue suede upper with mesh panels and speckled grey side supports. At the heel, a visible air unit sits on a white and black midsole.',
        materials: { upper: 'Suede and mesh', sole: 'Rubber with visible Air' },
        tags: ['basketball', 'suede', 'retro'],
      },
    },
  },
  {
    slug: 'nike-pegasus-36',
    reference: 'AS-036',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 13000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: { weightGrams: 280, stackMm: 28 },
    model: 'nike-pegasus-36',
    accent: { dark: '#818cf8', light: '#5e66b5' },
    text: {
      es: {
        name: 'Nike Air Zoom Pegasus 36',
        colorway: 'Gris jaspeado y blanco',
        tagline: 'Para correr todos los días: ligero, amortiguado y con estampado jaspeado.',
        description:
          'Parte superior de malla con estampado gris jaspeado y Swoosh negro, sobre una media suela blanca de espuma. La suela de goma con patrón de agarre lo hace ideal para entrenar y para el día a día.',
        materials: { upper: 'Malla técnica', sole: 'Espuma con Zoom Air' },
        tags: ['running', 'ligero', 'amortiguación'],
      },
      en: {
        name: 'Nike Air Zoom Pegasus 36',
        colorway: 'Heather grey and white',
        tagline: 'Made for daily runs: light, cushioned and wrapped in a heathered print.',
        description:
          'A mesh upper with a heathered grey print and a black Swoosh, set on a white foam midsole. A rubber outsole with a grippy pattern makes it just as good for training as for everyday wear.',
        materials: { upper: 'Engineered mesh', sole: 'Foam with Zoom Air' },
        tags: ['running', 'lightweight', 'cushioning'],
      },
    },
  },
  {
    slug: 'jordan-4-travis-scott',
    reference: 'AS-415',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 45000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 40, to: 46 },
    attributes: { weightGrams: 540, stackMm: 34 },
    model: 'jordan-4-travis-scott',
    accent: { dark: '#ac5ef7', light: '#8f48d2' },
    text: {
      es: {
        name: 'Jordan 4 Retro Travis Scott',
        colorway: 'Lila, morado y negro',
        tagline: 'Gamuza lila con salpicado negro: el Jordan 4 en su versión más llamativa.',
        description:
          'Gamuza lila con forro morado intenso, soportes laterales y talón negros con salpicado de color. Los paneles de malla y la suela negra equilibran el conjunto.',
        materials: { upper: 'Gamuza y malla', sole: 'Goma' },
        tags: ['edición especial', 'gamuza', 'llamativo'],
      },
      en: {
        name: 'Jordan 4 Retro Travis Scott',
        colorway: 'Lilac, purple and black',
        tagline: 'Lilac suede with black speckles: the Jordan 4 at its boldest.',
        description:
          'Lilac suede with a deep purple lining, plus black side supports and a black heel finished with colorful speckles. Mesh panels and a black outsole keep the look balanced.',
        materials: { upper: 'Suede and mesh', sole: 'Rubber' },
        tags: ['special edition', 'suede', 'bold'],
      },
    },
  },
  {
    slug: 'nike-dunk-high-hawaii',
    reference: 'AS-085',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 16500,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: { weightGrams: 480, stackMm: 30 },
    model: 'nike-dunk-high-hawaii',
    accent: { dark: '#2dd4bf', light: '#1a796d' },
    text: {
      es: {
        name: 'Nike Dunk High Hawaii',
        colorway: 'Azul con estampado floral',
        tagline: 'Caña alta con estampado de flores hawaianas de punta a talón.',
        description:
          'Una Dunk de caña alta cubierta por un estampado floral en azul y rosa, con Swoosh color crema y tira en el talón. Etiqueta naranja en la lengüeta y suela de goma gris para usarla todos los días.',
        materials: { upper: 'Lona estampada', sole: 'Goma' },
        tags: ['caña alta', 'estampado', 'verano'],
      },
      en: {
        name: 'Nike Dunk High Hawaii',
        colorway: 'Blue floral print',
        tagline: 'A high-top covered toe to heel in a Hawaiian floral print.',
        description:
          'A high-top Dunk wrapped in a blue and pink floral print, with a cream Swoosh and a heel strap. An orange tongue label and a grey rubber outsole make it an easy everyday pick.',
        materials: { upper: 'Printed canvas', sole: 'Rubber' },
        tags: ['high-top', 'print', 'summer'],
      },
    },
  },
  {
    slug: 'adidas-trionda-2026',
    reference: 'AS-B26',
    category: 'ball',
    brand: 'adidas',
    priceCents: 17000,
    availability: 'new',
    sizes: { system: 'BALL', labels: ['5'] },
    attributes: { panels: 4, year: 2026, hostCountry: 'USA' },
    model: 'adidas-trionda-2026',
    accent: { dark: '#d4af37', light: '#7f6921' },
    text: {
      es: {
        name: 'Adidas Trionda',
        tagline: 'El balón del Mundial 2026 de Estados Unidos, México y Canadá.',
        description:
          'Cuatro paneles termosellados con los colores de los tres países anfitriones. Talla 5 oficial.',
        edition: 'Mundial Norteamérica 2026',
        hostCity: 'Nueva Jersey',
        materials: { finish: 'Termosellado' },
        tags: ['mundial', 'anfitriones', '2026'],
      },
      en: {
        name: 'Adidas Trionda',
        tagline: 'The ball of the 2026 World Cup in the United States, Mexico and Canada.',
        description:
          'Four thermally bonded panels in the colors of the three host countries. Official size 5.',
        edition: '2026 World Cup, North America',
        hostCity: 'New Jersey',
        materials: { finish: 'Thermally bonded' },
        tags: ['world cup', 'host nations', '2026'],
      },
    },
  },
  {
    slug: 'adidas-al-rihla-2022',
    reference: 'AS-B22',
    category: 'ball',
    brand: 'adidas',
    priceCents: 16000,
    availability: 'available',
    sizes: { system: 'BALL', labels: ['5'] },
    attributes: { panels: 20, year: 2022, hostCountry: 'QAT' },
    model: 'adidas-al-rihla-2022',
    accent: { dark: '#22d3ee', light: '#137685' },
    text: {
      es: {
        name: 'Adidas Al Rihla',
        tagline: 'Colores vivos inspirados en Catar y un nombre que significa "el viaje" en árabe.',
        description:
          'Veinte paneles termosellados con colores vivos inspirados en la cultura y la bandera de Catar. Talla 5 oficial.',
        edition: 'Mundial Catar 2022',
        hostCity: 'Lusail',
        materials: { finish: 'Termosellado' },
        tags: ['mundial', 'colorido', '2022'],
      },
      en: {
        name: 'Adidas Al Rihla',
        tagline: 'Bright colors inspired by Qatar and a name that means "the journey" in Arabic.',
        description:
          'Twenty thermally bonded panels in bright colors inspired by the culture and flag of Qatar. Official size 5.',
        edition: '2022 World Cup, Qatar',
        hostCity: 'Lusail',
        materials: { finish: 'Thermally bonded' },
        tags: ['world cup', 'colorful', '2022'],
      },
    },
  },
  {
    slug: 'adidas-jabulani-2010',
    reference: 'AS-B10',
    category: 'ball',
    brand: 'adidas',
    priceCents: 14000,
    availability: 'available',
    sizes: { system: 'BALL', labels: ['5'] },
    attributes: { panels: 8, year: 2010, hostCountry: 'ZAF' },
    model: 'adidas-jabulani-2010',
    accent: { dark: '#f87171', light: '#ae4f4f' },
    text: {
      es: {
        name: 'Adidas Jabulani',
        tagline: 'Paneles termosellados y colores de Sudáfrica: el balón más comentado de su época.',
        description:
          'Ocho paneles termosellados y una superficie con textura, en los colores de Sudáfrica. Su trayectoria impredecible dio de qué hablar en todo el torneo. Talla 5 oficial.',
        edition: 'Mundial Sudáfrica 2010',
        hostCity: 'Johannesburgo',
        materials: { finish: 'Termosellado' },
        tags: ['mundial', 'clásico', '2010'],
      },
      en: {
        name: 'Adidas Jabulani',
        tagline: 'Thermally bonded panels and South African colors: the most talked-about ball of its time.',
        description:
          'Eight thermally bonded panels and a textured surface in South African colors. Its unpredictable movement was the talk of the whole tournament. Official size 5.',
        edition: '2010 World Cup, South Africa',
        hostCity: 'Johannesburg',
        materials: { finish: 'Thermally bonded' },
        tags: ['world cup', 'classic', '2010'],
      },
    },
  },
  {
    slug: 'adidas-teamgeist-2006',
    reference: 'AS-B06',
    category: 'ball',
    brand: 'adidas',
    priceCents: 15000,
    availability: 'available',
    sizes: { system: 'BALL', labels: ['5'] },
    attributes: { panels: 14, year: 2006, hostCountry: 'DEU' },
    model: 'adidas-teamgeist-2006',
    accent: { dark: '#fbbf24', light: '#886713' },
    text: {
      es: {
        name: 'Adidas Teamgeist',
        tagline: 'El balón de la final de 2006, con detalles dorados y su forma de hélice inconfundible.',
        description:
          'Catorce paneles con un diseño de hélice inconfundible y detalles dorados de la edición de la final en Berlín. Talla 5 oficial.',
        edition: 'Mundial Alemania 2006',
        hostCity: 'Berlín',
        materials: { finish: 'Termosellado' },
        tags: ['mundial', 'edición final', '2006'],
      },
      en: {
        name: 'Adidas Teamgeist',
        tagline: 'The ball of the 2006 final, with gold details and its unmistakable propeller shape.',
        description:
          'Fourteen panels with an unmistakable propeller design and the gold details of the Berlin final edition. Official size 5.',
        edition: '2006 World Cup, Germany',
        hostCity: 'Berlin',
        materials: { finish: 'Thermally bonded' },
        tags: ['world cup', 'final edition', '2006'],
      },
    },
  },
  {
    slug: 'adidas-telstar-1970',
    reference: 'AS-B70',
    category: 'ball',
    brand: 'adidas',
    priceCents: 12000,
    availability: 'available',
    sizes: { system: 'BALL', labels: ['5'] },
    attributes: { panels: 32, year: 1970, hostCountry: 'MEX' },
    model: 'adidas-telstar-1970',
    text: {
      es: {
        name: 'Adidas Telstar',
        tagline: 'El primer balón de Adidas para un Mundial: 32 paneles en blanco y negro pensados para la televisión.',
        description:
          'Doce pentágonos negros y veinte hexágonos blancos cosidos, un diseño pensado para verse bien en las transmisiones en blanco y negro. Talla 5.',
        edition: 'Mundial México 1970',
        hostCity: 'Ciudad de México',
        materials: { finish: 'Cuero cosido' },
        tags: ['mundial', 'retro', '1970'],
      },
      en: {
        name: 'Adidas Telstar',
        tagline: "Adidas's first World Cup ball: 32 black and white panels designed for television.",
        description:
          'Twelve black pentagons and twenty white hexagons, stitched together in a design made to stand out on black and white broadcasts. Size 5.',
        edition: '1970 World Cup, Mexico',
        hostCity: 'Mexico City',
        materials: { finish: 'Stitched leather' },
        tags: ['world cup', 'retro', '1970'],
      },
    },
  },
];
