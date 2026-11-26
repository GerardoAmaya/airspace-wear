import { Header } from '@nestjs/common';

// Lecturas públicas: el navegador y la CDN pueden reutilizarlas un minuto y
// servirlas viejas mientras revalidan (la web también revalida con fetch).
export const PublicCache = () => Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
