import type { Locale } from '@airspace/contracts';
import { buildStylistData } from './stylist-data';
import { StylistSection } from './StylistSection';

// Sección "Estilista IA" (#estilista). El servidor arma el guion en el idioma
// de la ruta con datos reales de la API (nombre, precio, etiquetas y póster
// de cada recomendación) y la consola del cliente lo reproduce. Los mismos
// datos sirve app/api/stylist/context al panel flotante del estilista.
export async function HomeStylist({ locale }: { locale: Locale }) {
  const { script, chips, catalog, modelCount } = await buildStylistData(locale);
  return <StylistSection script={script} chips={chips} modelCount={modelCount} catalog={catalog} />;
}
