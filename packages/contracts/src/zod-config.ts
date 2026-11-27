import { z } from 'zod';

// Sin compilación en tiempo de ejecución: zod 4 prueba `new Function("")`
// para acelerar la validación de objetos, y en el navegador eso choca con la
// Content-Security-Policy de la web (sin 'unsafe-eval'), que registra una
// violación en cada página que valida datos. Con jitless valida igual, sin
// eval; la diferencia de velocidad no se nota con estos tamaños.
z.config({ jitless: true });
