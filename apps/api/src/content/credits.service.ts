import { Injectable } from '@nestjs/common';
import { CREDIT_CHANGES, type Credit, type CreditList } from '@airspace/contracts';
import { TtlCache } from '../common/ttl-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';

const KNOWN_CHANGES = new Set<string>(CREDIT_CHANGES);

@Injectable()
export class CreditsService {
  private readonly cache = new TtlCache<CreditList>(60_000, 1);

  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<CreditList> {
    return this.cache.get('credits', async () => {
      const rows = await this.prisma.assetCredit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      return {
        items: rows.map(
          (row): Credit => ({
            key: row.key,
            kind: row.kind,
            name: row.name,
            sourceTitle: row.sourceTitle,
            sourceUrl: row.sourceUrl,
            author: row.author,
            authorUrl: row.authorUrl,
            license: { name: row.licenseName, url: row.licenseUrl, commercialUse: row.commercialUse, shareAlike: row.shareAlike },
            // Solo códigos conocidos: la web tiene una traducción para cada uno.
            changes: row.changes.filter((change): change is Credit['changes'][number] => KNOWN_CHANGES.has(change)),
          }),
        ),
      };
    });
  }
}
