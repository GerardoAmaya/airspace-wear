import { z } from 'zod';

// Cuentas (docs/plan-paso-5.md). La sesión la maneja Better Auth en la web;
// la API identifica al usuario con el token de sesión que la web le reenvía
// (Authorization: Bearer <token>).

// Respuesta de GET /v1/me: el usuario con sesión válida.
export const meResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  image: z.string().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
