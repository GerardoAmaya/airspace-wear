import { z } from 'zod';
import { LOCALES } from './locales.js';

export { DEFAULT_LOCALE, LOCALES } from './locales.js';

export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;
