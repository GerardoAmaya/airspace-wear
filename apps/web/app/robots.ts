import type { MetadataRoute } from 'next';

// /robots.txt: todo el sitio se puede indexar menos las rutas internas.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' } };
}
