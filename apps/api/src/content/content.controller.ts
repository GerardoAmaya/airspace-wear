import { Controller, Get } from '@nestjs/common';
import type { CreditList } from '@airspace/contracts';
import { PublicCache } from '../common/cache-control.js';
import { CreditsService } from './credits.service.js';

@Controller()
export class ContentController {
  constructor(private readonly credits: CreditsService) {}

  // GET /v1/credits: modelos 3D, fuentes y librerías, con licencia y cambios.
  @Get('credits')
  @PublicCache()
  listCredits(): Promise<CreditList> {
    return this.credits.list();
  }
}
