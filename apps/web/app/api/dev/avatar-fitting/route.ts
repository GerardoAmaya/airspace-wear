import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFitting } from '@/lib/avatar/fitting';

// Guarda la calibración de los sneakers en el avatar (lib/avatar/fitting.json).
// Solo existe en desarrollo: la usa la herramienta /[locale]/hangar/dev. En
// producción responde 404 y nunca escribe en disco.
const FILE = path.join(process.cwd(), 'lib/avatar/fitting.json');

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  // Solo desde la misma máquina: la herramienta corre en localhost.
  const host = new URL(request.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return new Response(null, { status: 403 });
  const fitting = parseFitting(await request.json().catch(() => null));
  if (!fitting) return Response.json({ ok: false, error: 'invalid_fitting' }, { status: 400 });
  await writeFile(FILE, `${JSON.stringify(fitting, null, 2)}\n`, 'utf8');
  return Response.json({ ok: true });
}
