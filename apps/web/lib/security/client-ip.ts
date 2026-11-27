// IP del visitante para los límites de peticiones (solo servidor).
//
// Las cabeceras X-Forwarded-For y X-Real-IP las puede escribir cualquiera.
// Solo se creen cuando hay un proxy de confianza delante que las reemplaza:
// - En Vercel, que sobrescribe ambas con la IP real (un valor falso del
//   visitante no llega a la función).
// - Fuera de Vercel, con TRUST_PROXY=<saltos> (la misma variable que la
//   API): la IP es la que agregó el proxy más cercano, contando desde la
//   derecha. Sin TRUST_PROXY (next start expuesto directo, Docker local) no
//   hay IP confiable: Next solo completa X-Forwarded-For si falta.
// null significa "sin IP confiable": el límite usa un contador compartido.

// Una IP v4 o v6 (con o sin zona); otra cosa no se usa como clave.
const IP = /^[0-9A-Fa-f:.%]{2,64}$/;

function valid(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && IP.test(trimmed) ? trimmed : null;
}

export function clientIp(headers: Headers): string | null {
  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (process.env.VERCEL) return valid(headers.get('x-real-ip')) ?? valid(forwarded[0]);
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(hops) && hops > 0 && forwarded.length >= hops) return valid(forwarded[forwarded.length - hops]);
  return null;
}
