'use client';

import { createAuthClient } from 'better-auth/react';

// Cliente de Better Auth en el navegador. Llama a /api/auth del mismo
// origen (sin baseURL): la cookie de sesión es de la web.
export const authClient = createAuthClient();
