import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import type { MeResponse } from '@airspace/contracts';
import { CurrentUser, type SessionUser, SessionAuthGuard } from './session-auth.guard.js';

@Controller()
export class MeController {
  // GET /v1/me: el usuario de la sesión (401 { code: 'unauthorized' } sin
  // sesión válida). Datos personales: nunca en caché compartida.
  @Get('me')
  @UseGuards(SessionAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  me(@CurrentUser() user: SessionUser): MeResponse {
    return { id: user.id, name: user.name, email: user.email, image: user.image };
  }
}
