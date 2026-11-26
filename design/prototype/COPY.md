# Copy glossary

The visual HUD style stays (corner brackets, mono labels, grid, data readouts), but every visible word talks about sneakers, apparel and balls. No flight or airport metaphors in the text.

The only exception is **Hangar 360°**, which the user likes. Its own labels (rotating platform, scanner) can stay.

Spanish is the source copy. Keep it natural, neutral Latin American, short, and never use em dashes.

## Replace

| Avoid (aviation) | Use (store) |
| --- | --- |
| Vuelo AS-001 | Ref. AS-001 (product reference) |
| Destino (board column) | Modelo |
| Puerta A1 | Tallas, from `product.sizes` (for example "EU 38-47") |
| Estado (column) | Disponibilidad |
| Embarcando / A tiempo / Última llamada | Nuevo / Disponible / Últimos pares (from `catalog.AVAILABILITY`) |
| Salidas / Departures | Catálogo, with the label "Sneakers · Temporada 26" |
| Terminal AS · 08 vuelos programados | 08 modelos · Temporada 26 |
| Elige un vuelo | Elige un par |
| Vista previa · Señal estable · Pista 01 | Vista 3D · Arrastra para girar |
| Cargando aeronave... | Cargando modelo 3D... |
| Reservar asiento | Agregar al carrito |
| Inspección previa al vuelo | Pieza por pieza |
| Lista de verificación / Puntos de control | Detalles |
| Estado: en curso / completa | 02 de 04 detalles vistos / Recorrido completo |
| Inspección completa · Listo para despegar | Recorrido completo · Ahora elige el tuyo |
| Despegar (button) | Ver catálogo |
| ALT / HDG / SPD readouts | Giro (degrees), Peso, Precio, Tallas |
| Objetivo · AS-001 · Fijado | Modelo · Ref. AS-001 · En foco |
| AS-001 · Air Jordan 1 · Embarcando (hero tag) | Ref. AS-001 · Air Jordan 1 · Nuevo |
| Desliza para inspeccionar | Desliza para ver los detalles |
| Boot: secuencia de arranque, sistemas, navegación, tren de aterrizaje, aeronave, torre, T+ | Cargando colección: modelos 3D, texturas, iluminación, Air Jordan 1 (each one "OK") |
| Equipaje / Baggage claim / Banda 03 / En banda | Balones / Colección mundialista / En exhibición |
| Tags BER 2006 / JNB 2010 | ALEMANIA 2006 / SUDÁFRICA 2010 |
| Reclamar balón / comprobantes | Agregar al carrito / Elige tu balón |
| Torre de control / Habla con la torre | Estilista IA / Habla con tu estilista |
| FREQ 118.300 / TWR / RX TX / Piloto / "Recibido, piloto" | En línea / Estilista IA / Tú / Estilista / natural replies, for example "¡Claro! Para caminar todo el día te recomiendo..." |
| Pase de abordar / Listo para abordar | Tarjeta de miembro / Únete al club |
| Pasajero / Asiento / Embarque / Origen y destino / Vuelo AS-2026 / Clase / Talón | Miembro / Nº de miembro / Desde / Talla favorita / Acceso anticipado a lanzamientos |
| Última llamada · Puerta A1 (footer label) | Acceso anticipado |
| Volver a despegar ↑ | Volver arriba ↑ |
| Tarifa (price label) | Precio |
| Capellada (spec label) | Parte superior |
| En línea · Hora local (catalog bar clock) | A count from the catalog, for example "08 pares · 3 marcas" |
| Agregado (button feedback) | Agregado al carrito (same text in every section) |
| Section ids #flight, #departures, #tower, #boarding (they show up in the URL) | #inicio, #catalogo, #hangar, #balones, #estilista, #club |

## Words and formats

- Prices: "US$180" (Latin American style, built with Intl parts in `core/catalog.js`). Never "180 US$" or "USD 180".
- Tags are Spanish words a shopper would use: "suela gruesa" (not "chunky"), "llamativo" (not "statement"), "básquet" (not "baloncesto", one term everywhere).
- Desktop and touch: write instructions that fit both ("Elige un detalle"), or switch them with `(hover: hover)`. Avoid "Desliza" or "Toca" on desktop.
- The English version is not part of the prototype. The EN button shows a short note: "La versión en inglés llega con el sitio final."

## Keep

- The brand name AIRSPACE Wear. The hero headline is the featured shoe's name (for example "Jordan 4 / Travis Scott").
- Never use "Pisa el cielo" / "Walk on air": the user dislikes the phrase (removed 2026-11-25). No replacement slogan.
- Hangar 360° and its feature copy.
- Theme switch "Noche / Día", "Carrito", "Estilista IA", "Catálogo", "Balones".
