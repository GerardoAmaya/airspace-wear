import { DEFAULT_LOCALE, LOCALES } from '@airspace/contracts/locales';
import { defineRouting } from 'next-intl/routing';

// Rutas por idioma: /es (predeterminado) y /en. Los idiomas vienen de los
// contratos compartidos, los mismos que valida la API.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
});
