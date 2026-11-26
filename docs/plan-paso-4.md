# Plan del paso 4: ropa en el catálogo y en el avatar

Borrador para aprobación. No se escribe código hasta que apruebes las decisiones de la sección 7.

## 1. Objetivo

- **Catálogo de ropa:** camisetas, sudaderas, chaquetas, pants, calzonetas y gorras, cada prenda con su página de producto en 3D (giro, detalles, AR), igual que los sneakers. El filtro "Ropa", hoy en "Próximamente", se activa.
- **Portada:** una sección nueva de ropa, con el mismo formato de tarjetas que "Destacados".
- **Avatar:** en el Hangar 360° se le puede poner la ropa del catálogo encima del vestuario base, empezando con unas pocas prendas de prueba.

Cambia una regla de CLAUDE.md: hoy dice que en el avatar "solo cambian los zapatos". Pasaría a "cambian los zapatos y la ropa marcada como compatible con el avatar".

## 2. Prendas candidatas (revisadas: licencia, peso y aspecto)

**Recomendadas (CC BY, livianas):**

| Prenda | Triángulos | ¿Sirve para el avatar? |
| --- | --- | --- |
| Gorra NY azul marino | 17k | Sí, fácil: es rígida, va en el hueso de la cabeza |
| Sweater Nike Club Fleece (sudadera blanca) | 15k | Sí, con ajuste |
| Conjunto sudadera y pants gris (anorak) | 15k | Sí: está hecho sobre un cuerpo humano (MetaHuman), es el mejor candidato |
| Pants de mujer (gris con franjas lima) | 7k | Sí, mismo autor |
| Adidas Jacket (chumpa negra) | 6k | Sí, con ajuste |
| Women Sportswear (top y leggings) | 13k | Posible |
| Athletic sportswear set (manga larga y short) | 120k | Posible, tras optimizar |
| Varsity Jacket | 117k | Difícil (prenda gruesa con capas), mejor solo catálogo al inicio |
| Sport set top y falda | 27k | Solo catálogo: la falda necesita simulación de tela |

**Pesadas, se optimizan:** Polo Nike (926k), Women's Sportswear sudadera turquesa (709k), camiseta Power Philippines (839k). Solo catálogo al inicio.

**Con cuidado de licencia:** Shorts Pants (licencia Free Standard: se hospeda en Blob, fuera del repositorio) y Nike Fleece Hoodie (no comercial, como la Samba).

**Descartadas:** Sport suit (3,3 millones de triángulos) y Clothes (4 prendas mezcladas, una en gancho).

## 3. Pipeline de ropa

- El mismo pipeline de modelos (`scripts/models`) con una categoría nueva `apparel`. La pose canónica es una prenda centrada, de frente a la cámara (+Z), con su tamaño real de prenda talla M.
- Presupuesto igual que los sneakers: versión principal ≤ 100k triángulos y 1,1 MB; liviana ≤ 40k y 450 KB.
- Pósters en ambos temas y créditos generados, como hoy.

## 4. Ajuste al avatar (la parte difícil)

Por prenda compatible, un script de Blender:

1. Alinea y escala la prenda al cuerpo del Y Bot, con ajuste fino guardado por prenda.
2. La acerca al cuerpo con shrinkwrap suave para que no flote ni lo atraviese.
3. Le copia los pesos del esqueleto del cuerpo (Data Transfer), para que se doble con las animaciones.
4. Oculta la parte del cuerpo y de la ropa base que queda debajo.
5. Se revisa en reposo, caminar, girar y pose. Si se atraviesa en algún movimiento, se ajusta o la prenda queda solo para catálogo.

En el Hangar habría un selector de "Ropa" además del de zapatos. Cada prenda reemplaza a su equivalente del vestuario base (una sudadera reemplaza a la camiseta), y la gorra o los lentes se combinan con todo.

## 5. Fases

| Fase | Entrega | Se verifica |
| --- | --- | --- |
| 0. Datos | Categoría de ropa activa (tallas S a XL), marcas nuevas, textos es/en | Filtro "Ropa" con conteo, pruebas |
| 1. Catálogo | Modelos optimizados, pósters, páginas de producto con 3D y AR | Lo revisas en el visor antes de publicar |
| 2. Portada | Sección de ropa en la home | Capturas en 2 tamaños y 2 temas |
| 3. Avatar (piloto) | Gorra NY, conjunto anorak y pants, y sweater Nike en el avatar | Lo ves en local con las 4 animaciones |
| 4. Avatar (resto) | Las demás prendas compatibles | Igual que la fase 3 |

## 6. Riesgos

- **Cada prenda de Sketchfab está hecha para un cuerpo distinto.** El ajuste no es automático al 100 %; algunas pueden quedar solo en catálogo.
- **Prendas con capas pegadas** (exportadas de programas de diseño de ropa): al simplificarlas puede asomar la capa de abajo. Se usa el límite de error por modelo, como con los zapatos.
- **Faldas y prendas muy sueltas** necesitan simulación de tela; quedan fuera del avatar.
- **Peso en el Hangar:** avatar, zapatos y una o dos prendas. Se usan siempre las versiones livianas.

## 7. Decisiones que necesitan tu aprobación

| # | Decisión | Recomendación |
| --- | --- | --- |
| 1 | Qué prendas entran | Las 9 recomendadas más las 3 pesadas; las 2 de licencia delicada, con su nota |
| 2 | Tallas de ropa | S, M, L, XL |
| 3 | Sección en la portada | "Ropa" con 6 prendas destacadas y botón al catálogo filtrado, después de "Destacados" |
| 4 | Prendas piloto en el avatar | Gorra NY, conjunto anorak y pants, sweater Nike |
| 5 | Cambio en CLAUDE.md | "Cambian los zapatos y la ropa marcada como compatible con el avatar" |
