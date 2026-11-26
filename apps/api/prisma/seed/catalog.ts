// Catálogo semilla de AIRSPACE Wear: fuente de verdad de los productos.
// Portado de design/prototype/core/catalog.js; el texto en inglés se redactó
// aparte (no es traducción literal) y lo revisa el dueño del proyecto.
// /add-product agrega productos aquí, siempre con es y en.
//
// Precios y datos técnicos son ilustrativos (proyecto de portafolio).

import type { AlphaSize, Availability, AvatarSlot, Category, Locale, Subcategory } from '@airspace/contracts';
import { APPAREL_PRODUCTS } from './apparel.js';

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
  // Rango de tallas: EU para sneakers y tacos; ALPHA (letras, en orden:
  // S, M, L, XL) u ONE (talla única) para la ropa; los balones son talla 5.
  // El seed comprueba que el sistema corresponda a la categoría.
  // attributes.hostCountry: país sede (ISO 3166 alfa-3) en los balones.
  sizes: { system: 'EU'; from: number; to: number } | { system: 'ALPHA'; labels: AlphaSize[] } | { system: 'ONE' } | { system: 'BALL'; labels: string[] };
  // Solo ropa: subcategoría (obligatoria) y lugar en el avatar del Hangar
  // 360° (omitido: solo catálogo). Ver docs/plan-paso-4.md.
  subcategory?: Subcategory;
  avatarSlot?: AvatarSlot;
  // false: se carga en la base pero no se muestra (borradores, pruebas del
  // flujo). Por defecto, publicado.
  published?: boolean;
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
  { slug: 'vans', name: 'Vans' },
  { slug: 'on', name: 'On' },
  { slug: 'hoka', name: 'Hoka' },
  { slug: 'converse', name: 'Converse' },
  { slug: 'salomon', name: 'Salomon' },
  { slug: 'dior', name: 'Dior' },
  // Ropa (paso 4). AIRSPACE: prendas genéricas, sin marca real.
  { slug: 'geff', name: 'GEFF' },
  { slug: 'new-york-yankees', name: 'New York Yankees' },
  { slug: 'flexfit', name: 'Flexfit' },
  { slug: 'airspace', name: 'AIRSPACE' },
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
  // Ampliación del catálogo (22 pares). Sin datos técnicos (attributes
  // vacío): son muestras de portafolio y no se inventan pesos ni alturas.
  // Acentos provisionales (scripts/design/accents.mjs, tonos de las
  // miniaturas); se recalculan con los pósters. Sin acento: lima de la marca.
  {
    slug: 'air-jordan-1-low-dior',
    reference: 'AS-012',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 48000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 40, to: 46 },
    attributes: {},
    model: 'air-jordan-1-low-dior',
    text: {
      es: {
        name: 'Air Jordan 1 Low Dior',
        colorway: 'Blanco y gris',
        tagline: 'El Jordan 1 de caña baja con Swoosh de monograma oblicuo de Dior.',
        description:
          'Corte bajo en blanco y gris con el Swoosh cubierto por el monograma oblicuo de Dior. La suela translúcida de tono helado completa una colaboración pensada para coleccionistas.',
        materials: { upper: 'Cuero', sole: 'Goma translúcida' },
        tags: ['colaboración', 'caña baja', 'edición especial'],
      },
      en: {
        name: 'Air Jordan 1 Low Dior',
        colorway: 'White and grey',
        tagline: 'The low-top Jordan 1 with a Dior oblique monogram Swoosh.',
        description:
          'A white and grey low-top with the Swoosh covered in the Dior oblique monogram. An icy translucent sole finishes a collaboration made for collectors.',
        materials: { upper: 'Leather', sole: 'Translucent rubber' },
        tags: ['collaboration', 'low-top', 'special edition'],
      },
    },
  },
  {
    slug: 'jordan-4-black-cat',
    reference: 'AS-405',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 21000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'jordan-4-black-cat',
    text: {
      es: {
        name: 'Jordan 4 Retro Black Cat',
        colorway: 'Negro y gris oscuro',
        tagline: 'El Jordan 4 todo en negro, con detalles en gris oscuro.',
        description:
          'Parte superior negra de punta a talón, con soportes laterales, malla y detalles en gris oscuro. Un Jordan 4 sobrio que combina con todo.',
        materials: { upper: 'Nobuk y malla', sole: 'Goma' },
        tags: ['todo negro', 'básquet', 'retro'],
      },
      en: {
        name: 'Jordan 4 Retro Black Cat',
        colorway: 'Black and dark grey',
        tagline: 'The Jordan 4 in all black, with dark grey details.',
        description:
          'A black upper from toe to heel, with side supports, mesh and details in dark grey. A low-key Jordan 4 that goes with everything.',
        materials: { upper: 'Nubuck and mesh', sole: 'Rubber' },
        tags: ['all black', 'basketball', 'retro'],
      },
    },
  },
  {
    slug: 'nike-air-max-270',
    reference: 'AS-270',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 16000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'nike-air-max-270',
    accent: { dark: '#ef4a4a', light: '#c63838' },
    text: {
      es: {
        name: 'Nike Air Max 270',
        colorway: 'Durazno, azul marino y rojo',
        tagline: 'Una cámara de aire grande en el talón y un tejido ligero para todo el día.',
        description:
          'Parte superior de punto color durazno con Swoosh rojo y talón azul marino. Atrás, una unidad Air de gran tamaño en rojo le da su perfil inconfundible.',
        materials: { upper: 'Tejido de punto', sole: 'Espuma con Air en el talón' },
        tags: ['amortiguación', 'urbano', 'color'],
      },
      en: {
        name: 'Nike Air Max 270',
        colorway: 'Peach, navy and red',
        tagline: 'A big heel air unit and a light knit upper for all-day wear.',
        description:
          'A peach knit upper with a red Swoosh and a navy heel. At the back, an oversized red Air unit gives it its unmistakable profile.',
        materials: { upper: 'Knit', sole: 'Foam with heel Air' },
        tags: ['cushioning', 'streetwear', 'color'],
      },
    },
  },
  {
    slug: 'nike-air-max-pre-day',
    reference: 'AS-275',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 14000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: {},
    model: 'nike-air-max-pre-day',
    accent: { dark: '#c67039', light: '#a75724' },
    text: {
      es: {
        name: 'Nike Air Max Pre-Day',
        colorway: 'Crudo, marrón óxido y mostaza (Light Orewood Brown)',
        tagline: 'Tonos tierra, lona y una unidad Air a la vista: un Air Max relajado.',
        description:
          'Lona color crudo con Swoosh marrón óxido y detalles mostaza en el talón. La unidad Air visible y la suela en tono ladrillo completan un par fácil de combinar.',
        materials: { upper: 'Lona y sintético', sole: 'Espuma con Air visible' },
        tags: ['tonos tierra', 'lona', 'retro'],
      },
      en: {
        name: 'Nike Air Max Pre-Day',
        colorway: 'Light Orewood Brown',
        tagline: 'Earth tones, canvas and visible Air: a laid-back Air Max.',
        description:
          'Off-white canvas with a rust-brown Swoosh and mustard details at the heel. The visible Air unit and a brick-toned sole round out an easy pair to style.',
        materials: { upper: 'Canvas and synthetic', sole: 'Foam with visible Air' },
        tags: ['earth tones', 'canvas', 'retro'],
      },
    },
  },
  {
    slug: 'nike-react-presto',
    reference: 'AS-020',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 13000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: {},
    model: 'nike-react-presto',
    accent: { dark: '#956bf7', light: '#7a51d8' },
    text: {
      es: {
        name: 'Nike React Presto',
        colorway: 'Negro, morado y rosa',
        tagline: 'Ajuste tipo calcetín sobre una suela de espuma ancha y suave.',
        description:
          'Parte superior negra y elástica que se ajusta como un calcetín, con una pieza lateral morada y detalles rosa en la suela. La media suela de espuma, ancha y suave, hace cómodo cada paso.',
        materials: { upper: 'Malla elástica', sole: 'Espuma' },
        tags: ['comodidad', 'ajuste tipo calcetín', 'urbano'],
      },
      en: {
        name: 'Nike React Presto',
        colorway: 'Black, purple and pink',
        tagline: 'A sock-like fit on a wide, soft foam sole.',
        description:
          'A stretchy black upper that fits like a sock, with a purple side piece and pink accents on the sole. The wide, soft foam midsole keeps every step comfortable.',
        materials: { upper: 'Stretch mesh', sole: 'Foam' },
        tags: ['comfort', 'sock-like fit', 'streetwear'],
      },
    },
  },
  {
    slug: 'nike-structure-plus',
    reference: 'AS-026',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 14500,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'nike-structure-plus',
    text: {
      es: {
        name: 'Nike Structure Plus',
        colorway: 'Blanco, verde neón y negro',
        tagline: 'Para correr con estabilidad sobre una media suela gruesa en verde neón.',
        description:
          'Malla blanca con Swoosh negro sobre una media suela gruesa en verde neón. Un tenis de running pensado para correr distancias largas con una pisada firme.',
        materials: { upper: 'Malla', sole: 'Espuma' },
        tags: ['running', 'estabilidad', 'neón'],
      },
      en: {
        name: 'Nike Structure Plus',
        colorway: 'White, volt and black',
        tagline: 'Stable running on a thick volt midsole.',
        description:
          'White mesh with a black Swoosh on a thick volt midsole. A running shoe made for longer distances with a steady stride.',
        materials: { upper: 'Mesh', sole: 'Foam' },
        tags: ['running', 'stability', 'neon'],
      },
    },
  },
  {
    slug: 'nike-quest-running',
    reference: 'AS-031',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 8500,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'nike-quest-running',
    text: {
      es: {
        name: 'Nike Quest',
        colorway: 'Blanco, gris y verde neón',
        tagline: 'Un tenis de running sencillo y ligero para empezar a correr.',
        description:
          'Malla blanca y gris con Swoosh gris oscuro y detalles en verde neón. Una opción ligera y accesible para entrenar o para el día a día.',
        materials: { upper: 'Malla', sole: 'Espuma' },
        tags: ['running', 'ligero', 'diario'],
      },
      en: {
        name: 'Nike Quest',
        colorway: 'White, grey and volt',
        tagline: 'A simple, light running shoe to get you started.',
        description:
          'White and grey mesh with a dark grey Swoosh and volt accents. A light, affordable pick for training or everyday wear.',
        materials: { upper: 'Mesh', sole: 'Foam' },
        tags: ['running', 'lightweight', 'everyday'],
      },
    },
  },
  {
    slug: 'nike-defy-all-day',
    reference: 'AS-018',
    category: 'sneaker',
    brand: 'nike',
    priceCents: 7000,
    availability: 'available',
    sizes: { system: 'EU', from: 39, to: 47 },
    attributes: {},
    model: 'nike-defy-all-day',
    accent: { dark: '#e45656', light: '#d12424' },
    text: {
      es: {
        name: 'Nike Defy All Day',
        colorway: 'Blanco, negro y rojo',
        tagline: 'Corte blanco y suela firme para entrenar o caminar todo el día.',
        description:
          'Parte superior blanca de cuero sintético con Swoosh rojo y detalles negros. Un tenis de entrenamiento sencillo, cómodo en el gimnasio y en caminatas largas.',
        materials: { upper: 'Cuero sintético', sole: 'Goma' },
        tags: ['entrenamiento', 'caminar', 'clásico'],
      },
      en: {
        name: 'Nike Defy All Day',
        colorway: 'White, black and red',
        tagline: 'A white upper and a steady sole for training or walking all day.',
        description:
          'A white synthetic leather upper with a red Swoosh and black accents. A simple training shoe that feels comfortable at the gym and on long walks.',
        materials: { upper: 'Synthetic leather', sole: 'Rubber' },
        tags: ['training', 'walking', 'classic'],
      },
    },
  },
  {
    slug: 'vans-old-skool-blue',
    reference: 'AS-V36',
    category: 'sneaker',
    brand: 'vans',
    priceCents: 7500,
    availability: 'available',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: {},
    model: 'vans-old-skool-blue',
    accent: { dark: '#3b82f6', light: '#3069c7' },
    text: {
      es: {
        name: 'Vans Old Skool',
        colorway: 'Azul y blanco',
        tagline: 'La franja lateral de Vans en un azul que combina con todo.',
        description:
          'Un perfil bajo en azul con la franja lateral blanca de siempre y suela de goma. Un clásico del skate que se quedó en la calle.',
        materials: { upper: 'Lona y gamuza', sole: 'Goma vulcanizada' },
        tags: ['skate', 'clásico', 'perfil bajo'],
      },
      en: {
        name: 'Vans Old Skool',
        colorway: 'Blue and white',
        tagline: 'The Vans side stripe in a blue that goes with everything.',
        description:
          'A blue low-top with the familiar white side stripe and a rubber sole. A skate staple that stayed on the street.',
        materials: { upper: 'Canvas and suede', sole: 'Vulcanized rubber' },
        tags: ['skate', 'classic', 'low profile'],
      },
    },
  },
  {
    slug: 'vans-rock-haters',
    reference: 'AS-V77',
    category: 'sneaker',
    brand: 'vans',
    priceCents: 9500,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 36, to: 45 },
    attributes: {},
    model: 'vans-rock-haters',
    accent: { dark: '#e879f9', light: '#9950a4' },
    text: {
      es: {
        name: 'Vans Rock Haters',
        colorway: 'Holográfico multicolor',
        tagline: 'Un acabado holográfico que cambia de color con la luz.',
        description:
          'Una silueta de Vans con acabado holográfico que refleja tonos distintos según el ángulo. Suela de goma y mucho brillo para un par que no pasa desapercibido.',
        materials: { upper: 'Acabado holográfico', sole: 'Goma' },
        tags: ['holográfico', 'llamativo', 'edición especial'],
      },
      en: {
        name: 'Vans Rock Haters',
        colorway: 'Holographic multicolor',
        tagline: 'A holographic finish that shifts color with the light.',
        description:
          'A Vans silhouette with a holographic finish that reflects different tones from every angle. A rubber sole and plenty of shine for a pair that gets noticed.',
        materials: { upper: 'Holographic finish', sole: 'Rubber' },
        tags: ['holographic', 'bold', 'special edition'],
      },
    },
  },
  {
    slug: 'adidas-lightstrike',
    reference: 'AS-230',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 12000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: {},
    model: 'adidas-lightstrike',
    accent: { dark: '#6886be', light: '#506ca2' },
    text: {
      es: {
        name: 'Adidas Lightstrike',
        colorway: 'Azul marino, beige y blanco',
        tagline: 'Espuma ligera y tres franjas en tonos suaves para entrenar.',
        description:
          'Parte superior azul marino con tres franjas beige y media suela blanca de espuma ligera. Los cordones en tono cobre le dan un toque distinto.',
        materials: { upper: 'Malla y sintético', sole: 'Espuma ligera' },
        tags: ['running', 'ligero', 'diario'],
      },
      en: {
        name: 'Adidas Lightstrike',
        colorway: 'Navy, beige and white',
        tagline: 'Light foam and three soft-toned stripes for training.',
        description:
          'A navy upper with three beige stripes on a white lightweight foam midsole. Copper-toned laces add a different touch.',
        materials: { upper: 'Mesh and synthetic', sole: 'Lightweight foam' },
        tags: ['running', 'lightweight', 'everyday'],
      },
    },
  },
  {
    slug: 'adidas-retro-court',
    reference: 'AS-072',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 9000,
    availability: 'new',
    sizes: { system: 'EU', from: 36, to: 45 },
    attributes: {},
    model: 'adidas-retro-court',
    accent: { dark: '#b794d4', light: '#7b638e' },
    text: {
      es: {
        name: 'Adidas Gazelle Lila y Vino',
        colorway: 'Lila, vino y blanco',
        tagline: 'La Gazelle de siempre, en lila y vino.',
        description:
          'Gamuza lila con detalles color vino y tres franjas blancas sobre una suela delgada. Una silueta de cancha con aire retro que va bien con jeans o con pantalón de vestir.',
        materials: { upper: 'Gamuza', sole: 'Goma' },
        tags: ['retro', 'perfil bajo', 'gamuza'],
      },
      en: {
        name: 'Adidas Gazelle Lilac and Maroon',
        colorway: 'Lilac, maroon and white',
        tagline: 'The classic Gazelle, in lilac and maroon.',
        description:
          'Lilac suede with maroon details and three white stripes on a slim sole. A court silhouette with a retro feel that works with jeans or dress trousers.',
        materials: { upper: 'Suede', sole: 'Rubber' },
        tags: ['retro', 'low profile', 'suede'],
      },
    },
  },
  {
    slug: 'adidas-ozelia',
    reference: 'AS-250',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 12000,
    availability: 'available',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: {},
    model: 'adidas-ozelia',
    text: {
      es: {
        name: 'Adidas Ozelia',
        colorway: 'Blanco, gris y negro',
        tagline: 'Suela negra robusta y tres franjas negras sobre un corte blanco.',
        description:
          'Parte superior blanca con detalles grises y tres franjas negras, sobre una suela negra gruesa de formas marcadas. Un tenis de inspiración 2000 con volumen para el día a día.',
        materials: { upper: 'Malla y sintético', sole: 'Espuma' },
        tags: ['suela gruesa', 'urbano', 'blanco y negro'],
      },
      en: {
        name: 'Adidas Ozelia',
        colorway: 'White, grey and black',
        tagline: 'A chunky black sole and three black stripes on a white upper.',
        description:
          'A white upper with grey details and three black stripes, set on a thick, sculpted black sole. A 2000s-inspired sneaker with everyday volume.',
        materials: { upper: 'Mesh and synthetic', sole: 'Foam' },
        tags: ['chunky sole', 'streetwear', 'black and white'],
      },
    },
  },
  {
    slug: 'adidas-orange-running',
    reference: 'AS-240',
    category: 'sneaker',
    brand: 'adidas',
    priceCents: 11000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: {},
    model: 'adidas-orange-running',
    accent: { dark: '#fb7a55', light: '#ab533a' },
    text: {
      es: {
        name: 'Adidas Running',
        colorway: 'Naranja coral y negro',
        tagline: 'Tejido naranja y tres franjas negras para correr con color.',
        description:
          'Parte superior de punto color naranja coral con tres franjas negras y una suela de espuma a juego. Ligero y flexible para entrenar o para el día a día.',
        materials: { upper: 'Tejido de punto', sole: 'Espuma' },
        tags: ['running', 'color', 'ligero'],
      },
      en: {
        name: 'Adidas Running',
        colorway: 'Coral orange and black',
        tagline: 'An orange knit and three black stripes for running in color.',
        description:
          'A coral orange knit upper with three black stripes on a matching foam sole. Light and flexible for training or everyday wear.',
        materials: { upper: 'Knit', sole: 'Foam' },
        tags: ['running', 'color', 'lightweight'],
      },
    },
  },
  {
    slug: 'adidas-football-boot',
    reference: 'AS-C01',
    category: 'cleat',
    brand: 'adidas',
    priceCents: 13000,
    availability: 'new',
    sizes: { system: 'EU', from: 38, to: 46 },
    attributes: {},
    model: 'adidas-football-boot',
    accent: { dark: '#7dd3fc', light: '#447288' },
    text: {
      es: {
        name: 'Adidas Tacos de Fútbol',
        colorway: 'Celeste y amarillo',
        tagline: 'Tacos celestes con tapones amarillos, listos para la cancha.',
        description:
          'Parte superior celeste y una suela con tapones amarillos que se agarran bien a la cancha. Un par ligero para entrenar y para el partido del fin de semana.',
        materials: { upper: 'Sintético', sole: 'Suela con tapones' },
        tags: ['fútbol', 'tacos', 'color'],
      },
      en: {
        name: 'Adidas Football Boots',
        colorway: 'Light blue and yellow',
        tagline: 'Light blue boots with yellow studs, ready for the pitch.',
        description:
          'A light blue upper and a sole with yellow studs that grip the pitch. A light pair for training and the weekend match.',
        materials: { upper: 'Synthetic', sole: 'Studded sole' },
        tags: ['football', 'cleats', 'color'],
      },
    },
  },
  {
    slug: 'on-cloud',
    reference: 'AS-ON1',
    category: 'sneaker',
    brand: 'on',
    priceCents: 15000,
    availability: 'available',
    sizes: { system: 'EU', from: 37, to: 46 },
    attributes: {},
    model: 'on-cloud',
    text: {
      es: {
        name: 'On Cloud',
        colorway: 'Gris',
        tagline: 'Suela de módulos huecos y un gris que va con todo.',
        description:
          'Parte superior de malla gris sobre una suela de módulos huecos que se comprimen al pisar. Un tenis ligero para caminar la ciudad todo el día.',
        materials: { upper: 'Malla', sole: 'Módulos de espuma' },
        tags: ['ligero', 'comodidad', 'minimalista'],
      },
      en: {
        name: 'On Cloud',
        colorway: 'Grey',
        tagline: 'A sole of hollow pods in a grey that goes with everything.',
        description:
          'A grey mesh upper on a sole of hollow pods that compress with every step. A light shoe for walking the city all day.',
        materials: { upper: 'Mesh', sole: 'Foam pods' },
        tags: ['lightweight', 'comfort', 'minimal'],
      },
    },
  },
  {
    slug: 'hoka-mach-5',
    reference: 'AS-H05',
    category: 'sneaker',
    brand: 'hoka',
    priceCents: 14000,
    availability: 'new',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'hoka-mach-5',
    accent: { dark: '#3b82f6', light: '#3069c7' },
    text: {
      es: {
        name: 'Hoka Mach 5',
        colorway: 'Azul con degradado naranja',
        tagline: 'Media suela alta y un degradado de azul a naranja.',
        description:
          'Malla azul que pasa a naranja en degradado, sobre una media suela alta de espuma. Un tenis de running ligero y amortiguado para entrenar a diario.',
        materials: { upper: 'Malla', sole: 'Espuma' },
        tags: ['running', 'amortiguación', 'degradado'],
      },
      en: {
        name: 'Hoka Mach 5',
        colorway: 'Blue with an orange fade',
        tagline: 'A high-stack midsole and a blue to orange fade.',
        description:
          'Blue mesh that fades into orange, on a high-stack foam midsole. A light, cushioned running shoe for daily training.',
        materials: { upper: 'Mesh', sole: 'Foam' },
        tags: ['running', 'cushioning', 'gradient'],
      },
    },
  },
  {
    slug: 'converse-chuck-taylor',
    reference: 'AS-070',
    category: 'sneaker',
    brand: 'converse',
    priceCents: 7000,
    availability: 'available',
    sizes: { system: 'EU', from: 36, to: 46 },
    attributes: {},
    model: 'converse-chuck-taylor',
    accent: { dark: '#ef4a4a', light: '#c63838' },
    text: {
      es: {
        name: 'Converse Chuck Taylor All Star',
        colorway: 'Rojo',
        tagline: 'Lona roja, caña alta y la puntera de goma de siempre.',
        description:
          'Caña alta de lona roja con el parche de la estrella en el tobillo, puntera de goma y suela vulcanizada. Un clásico que combina con casi todo desde hace décadas.',
        materials: { upper: 'Lona', sole: 'Goma vulcanizada' },
        tags: ['clásico', 'caña alta', 'lona'],
      },
      en: {
        name: 'Converse Chuck Taylor All Star',
        colorway: 'Red',
        tagline: 'Red canvas, a high-top cut and the classic rubber toe cap.',
        description:
          'A red canvas high-top with the star patch at the ankle, a rubber toe cap and a vulcanized sole. A classic that has gone with almost anything for decades.',
        materials: { upper: 'Canvas', sole: 'Vulcanized rubber' },
        tags: ['classic', 'high-top', 'canvas'],
      },
    },
  },
  {
    slug: 'salomon-xt-6',
    reference: 'AS-S06',
    category: 'sneaker',
    brand: 'salomon',
    priceCents: 19000,
    availability: 'low_stock',
    sizes: { system: 'EU', from: 37, to: 46 },
    attributes: {},
    model: 'salomon-xt-6',
    text: {
      es: {
        name: 'Salomon XT-6',
        colorway: 'Blanco',
        tagline: 'Un tenis de montaña que la ciudad adoptó, en blanco total.',
        description:
          'Parte superior blanca con refuerzos en capas, cordones de ajuste rápido y una suela con relieve marcado para buen agarre. Nació para el sendero y hoy es un básico urbano.',
        materials: { upper: 'Malla y sintético', sole: 'Goma con relieve' },
        tags: ['montaña', 'urbano', 'blanco'],
      },
      en: {
        name: 'Salomon XT-6',
        colorway: 'White',
        tagline: 'A trail shoe the city adopted, in all white.',
        description:
          'A white upper with layered overlays, quick laces and a deeply lugged sole for solid grip. Born on the trail and now a city staple.',
        materials: { upper: 'Mesh and synthetic', sole: 'Lugged rubber' },
        tags: ['trail', 'streetwear', 'white'],
      },
    },
  },
  {
    slug: 'dior-b30',
    reference: 'AS-D30',
    category: 'sneaker',
    brand: 'dior',
    priceCents: 110000,
    availability: 'available',
    sizes: { system: 'EU', from: 39, to: 46 },
    attributes: {},
    model: 'dior-b30',
    accent: { dark: '#d3607c', light: '#be123c' },
    text: {
      es: {
        name: 'Dior B30',
        colorway: 'Vino, amarillo y gris',
        tagline: 'Un tenis de lujo con aire de running y el logo CD en el lateral.',
        description:
          'Paneles color vino, amarillo y gris con el logo CD a lo largo del lateral, sobre una suela gris de varias capas. Lujo con perfil deportivo.',
        materials: { upper: 'Malla y sintético', sole: 'Goma' },
        tags: ['lujo', 'running', 'llamativo'],
      },
      en: {
        name: 'Dior B30',
        colorway: 'Maroon, yellow and grey',
        tagline: "A luxury sneaker with a runner's look and the CD logo on the side.",
        description:
          'Maroon, yellow and grey panels with the CD logo along the side, over a layered grey sole. Luxury with a sporty profile.',
        materials: { upper: 'Mesh and synthetic', sole: 'Rubber' },
        tags: ['luxury', 'runner', 'bold'],
      },
    },
  },
  {
    slug: 'dior-star-platform',
    reference: 'AS-D10',
    category: 'sneaker',
    brand: 'dior',
    priceCents: 105000,
    availability: 'available',
    sizes: { system: 'EU', from: 35, to: 41 },
    attributes: {},
    model: 'dior-star-platform',
    text: {
      es: {
        name: 'Dior Star Platform',
        colorway: 'Blanco',
        tagline: 'Todo en blanco, con una estrella en el lateral y suela de plataforma.',
        description:
          'Un tenis blanco con una estrella en el lateral sobre una suela de plataforma. Minimalista, con unos centímetros extra.',
        materials: { sole: 'Plataforma de goma' },
        tags: ['plataforma', 'minimalista', 'lujo'],
      },
      en: {
        name: 'Dior Star Platform',
        colorway: 'White',
        tagline: 'All white, with a star on the side and a platform sole.',
        description:
          'A white sneaker with a star on the side, set on a platform sole. Minimal, with a few extra centimeters.',
        materials: { sole: 'Rubber platform' },
        tags: ['platform', 'minimal', 'luxury'],
      },
    },
  },
  {
    slug: 'new-balance-fresh-foam-roav',
    reference: 'AS-160',
    category: 'sneaker',
    brand: 'new-balance',
    priceCents: 9000,
    availability: 'available',
    sizes: { system: 'EU', from: 38, to: 47 },
    attributes: {},
    model: 'new-balance-fresh-foam-roav',
    text: {
      es: {
        name: 'New Balance Fresh Foam Roav',
        colorway: 'Gris oscuro y blanco',
        tagline: 'Tejido gris oscuro y espuma suave para moverte todo el día.',
        description:
          'Parte superior de punto gris oscuro con la N en el lateral, sobre una media suela blanca de espuma. Cómodo para entrenar, caminar o para el día a día.',
        materials: { upper: 'Tejido de punto', sole: 'Espuma Fresh Foam' },
        tags: ['comodidad', 'diario', 'ligero'],
      },
      en: {
        name: 'New Balance Fresh Foam Roav',
        colorway: 'Dark grey and white',
        tagline: 'A dark grey knit and soft foam to keep you moving all day.',
        description:
          'A dark grey knit upper with the N on the side, over a white foam midsole. Comfortable for training, walking or everyday wear.',
        materials: { upper: 'Knit', sole: 'Fresh Foam' },
        tags: ['comfort', 'everyday', 'lightweight'],
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
  // Ropa: vive en prisma/seed/apparel.ts (después de los balones).
  ...APPAREL_PRODUCTS,
];

// Productos que el seed deja publicados (los demás quedan como borrador).
export const isPublished = (product: SeedProduct): boolean => product.published !== false;
export const PUBLISHED_PRODUCTS: SeedProduct[] = PRODUCTS.filter(isPublished);
