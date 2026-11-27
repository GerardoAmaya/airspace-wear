import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { SessionAuthGuard } from './session-auth.guard.js';

// Cuentas: la API no inicia sesiones (eso lo hace Better Auth en la web),
// solo valida el token de sesión que la web reenvía. Los pedidos importarán
// SessionAuthGuard y CurrentUser de aquí.
@Module({
  controllers: [MeController],
  providers: [SessionAuthGuard],
  exports: [SessionAuthGuard],
})
export class AuthModule {}
