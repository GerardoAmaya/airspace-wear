import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

// /robots.txt: todo el sitio se puede indexar menos las rutas internas, y
// apunta al sitemap con la URL pública del sitio (SITE_URL).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: absoluteUrl('/sitemap.xml') };
}
