# Plan del paso 3: Hangar 360°

Borrador para aprobación. No se escribe código hasta que apruebes las decisiones de la sección 8.

## 1. Objetivo

Convertir el Hangar 360° (hoy un adelanto con "Próximamente") en la función real de CLAUDE.md: un avatar animado de Mixamo que lleva puesto el sneaker que elijas, visto en 360°. Solo cambian los zapatos; el avatar es siempre el mismo.

Entrega:

- Una página `/[locale]/hangar` con el avatar sobre la plataforma giratoria (la misma estética del adelanto actual).
- Un selector con los 13 sneakers del catálogo. Al elegir uno, el par cambia en los pies del avatar.
- Controles explícitos: arrastrar para girar, botones de giro y chips de animación (Pose, Caminar, Girar). Nada se mueve con el scroll.
- Agregar al carrito el par que lleva puesto.
- La sección de la home pasa de "Próximamente" a enlazar la página real.

## 2. Qué NO entra

- Elegir entre varios avatares, ropa en el avatar o balones en el Hangar.
- Captura de video o compartir en redes.
- AR del avatar (el AR sigue en la ficha de cada producto).
- Modelos de sneakers nuevos.

## 3. Avatar y animaciones (Mixamo)

**Qué hay que descargar (tú, con tu cuenta de Adobe; Mixamo es gratis):**

- Un personaje neutro. Recomiendo **Y Bot** o **X Bot**: maniquí sin ropa ni zapatos, que no compite con el sneaker y funciona en tema claro y oscuro.
- Cuatro animaciones "In Place": una de reposo (Idle), una de caminar, un giro sobre sí mismo y una pose de presentación.
- Formato FBX, 30 fps. El personaje "With Skin"; las animaciones "Without Skin".

**Pipeline** (extiende `scripts/models`, mismas reglas del paso 1):

- FBX a GLB con Blender en modo línea de comandos.
- Las animaciones se juntan en un solo GLB con el esqueleto del personaje.
- Compresión Meshopt y texturas WebP.
- Escala real: 1,75 m de alto, pies en y = 0.
- **Presupuesto:** avatar con animaciones ≤ 1,5 MB y ≤ 25k triángulos. En modo liviano, ≤ 700 KB.

**Licencia:** Mixamo permite usar personajes y animaciones en proyectos, también comerciales, pero no redistribuir los archivos tal cual. Como el repositorio es público, propongo no versionar el avatar (decisión 2).

## 4. Cómo se ponen los sneakers

La pose canónica del paso 1 (suela en y = 0, punta hacia +X, 0,30 m) hace que una sola calibración por pie sirva para todos los sneakers.

- **Anclaje:** cada zapato se cuelga del hueso del pie del avatar (`mixamorig:LeftFoot` y `mixamorig:RightFoot`) con un desfase calibrado una vez. Se usan los `-lite.glb`, como dice CLAUDE.md.
- **Pie izquierdo:** los modelos son de un solo pie (`pose.foot` en el manifiesto). El otro se obtiene en espejo (escala X = -1, con el orden de los vértices corregido). Se nota en logos laterales asimétricos, algo aceptable para un portafolio. La alternativa es extraer el otro pie de los escaneos que venían en par (`extractedFromPair`), con más trabajo.
- **Pie del avatar:** el pie del maniquí atravesaría el zapato, así que esa parte de la malla se recorta en el pipeline.
- **Ajuste fino por modelo:** para suelas altas o modelos un poco más largos, un campo opcional en el manifiesto (`avatarFit`) con altura, escala y avance.
- **Herramienta de calibración:** una página de desarrollo con controles, para ajustar los desfases y guardarlos. Tú revisas el resultado a ojo antes de cerrarlo.

**Requisito previo:** arreglar `normalizePose` (CLAUDE.md, "Known issue"). Hoy algunos zapatos quedan entre 1 y 5 % más cortos que 0,30 m, y en el avatar se notaría. Después se recalibran los hotspots de las fichas, que están en coordenadas del modelo.

## 5. La página

- **Escena:** el avatar en el centro de la plataforma giratoria, con el halo de estudio y las luces por tema de las otras escenas, para que el par negro y el blanco se vean en ambos temas.
- **Entrada:** el escenario aparece vacío y el avatar entra con un fundido, ya animado, igual que en las demás secciones.
- **Lectura de datos:** marca, nombre, precio, tallas y el botón "Agregar al carrito" del par que lleva puesto. El selector de tallas reutiliza el de la ficha.
- **Selector:** una fila de tarjetas con el póster de 600 px. Al pasar el cursor o enfocar una tarjeta se precarga su GLB.
- **Movimiento:**
  - un solo lienzo dibujando;
  - DPR máximo de 1,5 (1 en modo liviano);
  - se pausa fuera de vista;
  - con movimiento reducido, pose quieta sin animación automática.
- **Textos:** todo en `messages`, en español e inglés. Se mantiene "Hangar 360°", la única excepción de vocabulario.

## 6. Presupuestos

| Métrica | Meta |
| --- | --- |
| JS de la ruta, sin 3D | ≤ 220 KB gzip |
| 3D diferido de la ruta | ≤ 350 KB gzip |
| Avatar | ≤ 1,5 MB (liviano ≤ 700 KB) |
| Cuadros | 60 fps en un teléfono de gama media con avatar y par puestos |
| Cambio de par | El par nuevo aparece en menos de 1 s si ya estaba precargado |

## 7. Fases

Cada fase cierra con una demo y espera tu visto bueno.

| Fase | Entrega | Se verifica |
| --- | --- | --- |
| 0. Preparación | Arreglo de `normalizePose`, `pnpm models` de nuevo, hotspots recalibrados, pósters regenerados | Largo de 0,30 m ± 0,5 % en los 18 modelos; hotspots en su lugar en las fichas |
| 1. Avatar | Descargas de Mixamo (tú), pipeline del avatar, escena de prueba con un par puesto y la herramienta de calibración | Lo ves en local con 3 pares (negro, blanco y de suela alta) en ambos temas |
| 2. Página | `/hangar` completa: selector, controles, animaciones, carrito, modo liviano y movimiento reducido | Capturas en 2 tamaños y 2 temas, 60 fps, recargas |
| 3. Cierre | Home enlazada, créditos (Mixamo en `CREDITS.md` y `/credits`), pruebas E2E, `/i18n-check`, despliegue | E2E verdes, Lighthouse sin bajar, en producción |

## 8. Decisiones que necesitan tu aprobación

| # | Decisión | Recomendación |
| --- | --- | --- |
| 1 | Personaje: maniquí neutro (Y Bot / X Bot) o un personaje con estilo | Maniquí neutro: el protagonista es el sneaker |
| 2 | Dónde vive el avatar: en el repositorio (público) o fuera, en Vercel Blob (gratis) | Vercel Blob: respeta la licencia de Mixamo; el pipeline lo sube y el sitio lo descarga desde ahí |
| 3 | Pie izquierdo: espejo del derecho o extraído del escaneo en par | Espejo para los 13; extraer solo si alguno se ve mal |
| 4 | Animaciones: reposo, caminar, girar y pose | Esas cuatro; más adelante se pueden sumar |
| 5 | Dirección: `/hangar` | `/hangar` en ambos idiomas, con "Hangar 360°" como título |

## 9. Riesgos

- **Recorte del pie del avatar:** si queda mal, el tobillo se ve por dentro del zapato. Se revisa en la fase 1 con el par de caña alta (Jordan 4) y el de caña baja (Samba).
- **Caminar con zapatos rígidos:** el zapato sigue al pie como un bloque y no se dobla. En caminata lenta casi no se nota; si molesta, la animación principal es la pose y caminar queda como opción.
- **Memoria en teléfonos:** avatar con esqueleto más un par. Se usan siempre las variantes livianas de los zapatos.
- **Mixamo exige cuenta de Adobe:** las descargas te tocan a ti; te dejo la lista exacta en la fase 1.
