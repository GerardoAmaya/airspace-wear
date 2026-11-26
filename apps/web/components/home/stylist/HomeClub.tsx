import type { Locale } from '@airspace/contracts';
import { ClubSection } from './ClubSection';

// Sección del club (#club): la tarjeta de miembro de la home. No pide datos
// (la fase 2 no tiene cuentas); todo el texto sale de HomeClub en los
// mensajes y la parte interactiva vive en el cliente.
export async function HomeClub({ locale }: { locale: Locale }) {
  void locale;
  return <ClubSection />;
}
