// Idiomas del sitio. El español es el predeterminado (ver CLAUDE.md).
// Sin zod a propósito: la web los importa desde '@airspace/contracts/locales'
// en el enrutado, que llega al navegador en todas las páginas, y así no
// arrastra los esquemas al JS inicial.
export const LOCALES = ['es', 'en'] as const;
export const DEFAULT_LOCALE = 'es' satisfies (typeof LOCALES)[number];
