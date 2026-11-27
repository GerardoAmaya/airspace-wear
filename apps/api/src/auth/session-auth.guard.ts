import { type CanActivate, createParamDecorator, type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

// Sesión del usuario en la API (docs/plan-paso-5.md, fase 1).
//
// Better Auth vive en la web: crea la sesión al volver de Google y guarda una
// fila en la tabla session con un token opaco (32 caracteres al azar), que el
// navegador lleva firmado en una cookie httpOnly del dominio de la web. La API
// está en otro dominio, así que esa cookie nunca le llega. Por eso el servidor
// de la web lee su sesión y reenvía el token en Authorization: Bearer <token>,
// y la API lo busca en la misma base (Neon): una consulta por índice único,
// sin llamar a la web ni compartir el secreto de las cookies. Si la sesión se
// cierra (la fila se borra) o vence, la API lo sabe en la siguiente petición.

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  sessionUser?: SessionUser;
}

// Los tokens de Better Auth son alfanuméricos; se acepta un margen por si
// cambia el formato, pero nada que no parezca un token llega a la base.
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{16,256})$/;

const unauthorized = () => new HttpException({ code: 'unauthorized' } satisfies ApiError, HttpStatus.UNAUTHORIZED);

export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  return BEARER.exec(header.trim())?.[1] ?? null;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw unauthorized();
    const session = await this.prisma.session.findUnique({
      where: { token },
      select: { expiresAt: true, user: { select: { id: true, name: true, email: true, image: true } } },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) throw unauthorized();
    request.sessionUser = session.user;
    return true;
  }
}

// Usuario de la sesión en un controlador protegido con SessionAuthGuard.
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  const user = context.switchToHttp().getRequest<AuthRequest>().sessionUser;
  if (!user) throw unauthorized();
  return user;
});
