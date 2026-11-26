import { Module } from '@nestjs/common';
import { ContentController } from './content.controller.js';
import { CreditsService } from './credits.service.js';

// Contenidos que no son productos: por ahora, los créditos.
@Module({
  controllers: [ContentController],
  providers: [CreditsService],
})
export class ContentModule {}
