import type { routing } from './i18n/routing';
import type base from './messages/es.json';
import type apparel from './messages/home/apparel.es.json';
import type balls from './messages/home/balls.es.json';
import type board from './messages/home/board.es.json';
import type hero from './messages/home/hero.es.json';
import type stylist from './messages/home/stylist.es.json';

// Tipos de next-intl: una llave de mensaje que no existe falla en typecheck.
// Los mensajes son la base más un archivo por sección de la home.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof base & typeof hero & typeof board & typeof apparel & typeof balls & typeof stylist;
  }
}
