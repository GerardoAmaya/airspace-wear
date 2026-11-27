# Plan del paso 5: cuenta, pago de prueba y seguimiento del pedido

Borrador para aprobación. No se escribe código hasta que apruebes las decisiones de la sección 6.

## 1. Objetivo

Que la tienda se sienta completa de punta a punta, sin cobrar dinero real:

- **Cuenta:** iniciar sesión con Google.
- **Pago:** del carrito a un pago de prueba con tarjeta (sin cobro real).
- **Pedidos:** "Mis pedidos" y una página de seguimiento con la línea de tiempo del envío.

Todo sigue siendo gratis: Vercel Hobby, Neon y servicios en modo de prueba.

## 2. Inicio de sesión con Google

- **Librería:** Better Auth en la web (Next), con usuarios y sesiones guardados en Neon (tablas nuevas con Prisma). Sin proveedor externo de cuentas ni límites de usuarios.
- **Google:** necesita un "OAuth client" de Google Cloud (gratis). Lo creas tú en la consola de Google (te dejo los pasos exactos) y las claves van a las variables de entorno de Vercel.
- **En el sitio:** botón "Iniciar sesión" en el encabezado; con sesión, avatar y menú (Mis pedidos, Cerrar sesión).
- **API:** la web firma las llamadas con la sesión; la API solo acepta pedidos de usuarios con sesión válida.
- **Carrito:** sigue guardándose en el navegador; al iniciar sesión se une a la cuenta.

## 3. Pasarela de pago de prueba

- **Stripe en modo de prueba.** Es gratis, no cobra nada y acepta tarjetas de prueba (por ejemplo 4242 4242 4242 4242). Se instala desde el Marketplace de Vercel, que crea las claves de prueba solo.
- **Por qué no Shopify:** el Marketplace recomienda Shopify para tiendas, pero trae su propio catálogo y carrito. Nosotros ya tenemos catálogo, carrito y API propios; Stripe solo cobra.
- **Flujo:**
  1. En el carrito, "Pagar" (pide iniciar sesión si no hay sesión).
  2. La API crea el pedido como "pendiente" y una sesión de Stripe Checkout con los productos, tallas y precios del servidor (nunca los del navegador).
  3. El usuario paga en la página de Stripe y vuelve a "Pedido confirmado".
  4. Stripe avisa a la API (webhook firmado) y el pedido pasa a "pagado".
- **Aviso visible:** "Modo de prueba: no se cobra dinero real" en el carrito y en el pago, con la tarjeta de prueba a la vista.

## 4. Pedidos y seguimiento

- **Datos:** tablas de pedidos y líneas del pedido (producto, talla, precio, cantidad), número de pedido y número de guía ficticio.
- **Mis pedidos:** lista con fecha, total y estado.
- **Seguimiento:** página del pedido con la línea de tiempo: Pagado, Preparando, Enviado, En camino, Entregado. El avance es simulado por tiempo desde el pago (por ejemplo, un paso cada pocos minutos en la demo), así no hace falta un proceso aparte.
- **Estilo:** el mismo HUD del sitio (líneas, etiquetas mono), en ambos idiomas y temas.
- **Opcional:** correo de confirmación con Resend (plan gratis).

## 5. Fases

| Fase | Entrega | Se verifica |
| --- | --- | --- |
| 0. Datos | Tablas de usuarios, sesiones y pedidos (migración), contratos en `packages/contracts` | Migración en local y pruebas de la API |
| 1. Cuenta | Login con Google, menú de usuario, carrito unido a la cuenta | Lo pruebas en local con tu cuenta de Google |
| 2. Pago | Stripe de prueba, Checkout, webhook, pedido confirmado | Pago con la tarjeta 4242 en local y en producción |
| 3. Pedidos | Mis pedidos y seguimiento con línea de tiempo | Capturas en 2 tamaños y 2 temas |
| 4. Cierre | E2E, `/i18n-check`, documentación, despliegue | E2E verdes, en producción |

## 6. Decisiones que necesitan tu aprobación

| # | Decisión | Recomendación |
| --- | --- | --- |
| 1 | Librería de login | Better Auth con Google, datos en Neon |
| 2 | ¿Pagar requiere iniciar sesión? | Sí: así cada pedido queda en "Mis pedidos" |
| 3 | Pasarela | Stripe en modo de prueba, instalado desde el Marketplace de Vercel |
| 4 | Avance del seguimiento | Simulado por tiempo, un paso cada 5 minutos |
| 5 | Correo de confirmación | No por ahora (se puede sumar después) |

## 7. Lo que te toca a ti

- Crear el OAuth client de Google (te paso los pasos y las URLs de retorno).
- Aceptar la instalación de Stripe en el Marketplace de Vercel si lo pide en el navegador.
