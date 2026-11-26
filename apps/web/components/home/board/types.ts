import type { Availability, Model3D, Price, ProductSize } from '@airspace/contracts';

// Lo que el tablero necesita de cada sneaker (tarjeta de la API más etiquetas
// y tallas del detalle). Los textos ya llegan en el idioma de la página.
export interface BoardProduct {
  slug: string;
  reference: string;
  name: string;
  brand: { slug: string; name: string };
  colorway: string | null;
  tagline: string;
  tags: string[];
  price: Price;
  availability: Availability;
  sizeRange: { system: string; min: string; max: string } | null;
  sizes: ProductSize[];
  model: Model3D | null;
  // Acento del visor (de la API); null = lima de la marca.
  accent: { dark: string; light: string } | null;
}
