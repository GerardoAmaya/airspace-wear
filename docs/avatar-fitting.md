# Ajuste de los sneakers en el avatar (Hangar 360°)

Nota de diseño del paso 3, fase 1. Describe cómo se cuelga un sneaker `-lite.glb` de los pies del avatar de Mixamo en React Three Fiber, cómo se obtiene el pie contrario en espejo y qué desfases ajusta la herramienta de calibración. Todavía no hay código R3F: se escribe cuando lleguen los archivos de Mixamo y exista `assets/avatar/manifest.json`.

## 1. Los dos espacios

**Espacio del zapato** (pose canónica del paso 1, ya aplicada en cada GLB):

- metros, Y arriba;
- suela en y = 0, centrado en X y Z (el origen queda bajo el centro de la huella);
- punta hacia +X, largo de 0,30 m;
- zapato derecho: lado exterior hacia +Z. Zapato izquierdo: lado exterior hacia -Z (`pose.lateralSideFacing` en `assets/models/manifest.json`).

Los campos `pose.rotation` y `pose.yawCorrection` del manifiesto son historia del pipeline (el giro que llevó el original a la pose canónica). Ya están aplicados en el archivo: en tiempo de ejecución no se usan.

**Espacio del avatar** (lo fija `pnpm avatar:build`):

- metros, Y arriba, 1,75 m de alto;
- mira a +Z, con los pies en y = 0 y la cadera en X = Z = 0;
- el lado izquierdo del personaje queda en +X y el derecho en -X (mira hacia la cámara por defecto, que está en +Z).

El manifiesto del avatar guarda, para cada hueso del pie, su nombre en el GLB, su nombre en three.js y su matriz de reposo en el espacio del avatar (`bones.leftFoot.rest`, con traslación, rotación y escala).

## 2. Nombres de los huesos

En el GLB los huesos se llaman `mixamorig:LeftFoot` y `mixamorig:RightFoot` (el pipeline normaliza el prefijo, que en Mixamo puede ser `mixamorig1:` o `mixamorig9:`). Al cargar, `GLTFLoader` pasa los nombres por `PropertyBinding.sanitizeNodeName`, que quita los caracteres `[ ] . : /`. En three.js los huesos son `mixamorigLeftFoot` y `mixamorigRightFoot`. Por eso el manifiesto guarda los dos nombres (`gltfName` y `threeName`) y el código usa siempre `threeName`, por ejemplo `nodes[bones.leftFoot.threeName]` con el resultado de `useGLTF`.

## 3. De qué hueso se cuelga cada zapato

Los modelos traen un solo pie (`pose.foot`). El archivo original va en su pie y el otro pie lleva la copia en espejo:

| Pie del modelo | Original en | Espejo en | Modelos |
| --- | --- | --- | --- |
| derecho | `mixamorigRightFoot` | `mixamorigLeftFoot` | Air Jordan 1 (extraído de un par), New Balance 997, Adidas Sambae, Adidas Prophere, Air Jordan 1 Mid Particle Beige, Jordan 4 University Blue, Nike Pegasus 36 |
| izquierdo | `mixamorigLeftFoot` | `mixamorigRightFoot` | Nike Air Uptempo, Adidas Samba, Adidas Gazelle, Adidas Basketball, Jordan 4 Travis Scott, Nike Dunk High Hawaii |

## 4. Jerarquía en R3F

El zapato no se modela respecto del hueso sino respecto del avatar en reposo, y un grupo cancela el hueso. Así los desfases se escriben en metros y en ejes del avatar (fáciles de razonar y de ajustar con controles), aunque el hueso tenga ejes girados y escala 0,01 (Mixamo trabaja en centímetros).

```
mixamorigRightFoot          hueso animado
└─ mount                    matriz = inversa(reposo del hueso)    -> vuelve al espacio del avatar
   └─ fit                   posición, giro y escala de calibración (ejes del avatar)
      └─ mirror             scale = (-1, 1, 1) solo en el pie contrario
         └─ orient          rotation.y = -90°                     -> punta de +X a +Z
            └─ zapato       escena del -lite.glb, sin tocar
```

- **mount**: su matriz es la inversa de `bones.<pie>.rest` (traslación, rotación y escala del manifiesto). En reposo, hueso por mount da la identidad; cuando el pie se mueve en la animación, todo lo de abajo lo sigue como un bloque. Su escala sale cerca de 96 por la escala 0,01 del esqueleto: es lo esperado. Se calcula una vez al montar, nunca por cuadro.
- **orient**: un giro de -90° en Y lleva la punta de +X a +Z. El lado +Z del zapato pasa a -X: en un zapato derecho, el exterior queda hacia afuera del pie derecho, y en uno izquierdo (exterior en -Z) queda en +X, afuera del pie izquierdo. Con eso el original queda bien en su pie sin más cambios.
- **fit**: la calibración (sección 6).
- **zapato**: la escena del GLB. Los dos pies comparten geometría, materiales y texturas: la segunda copia es un `clone()` de la escena, que no duplica buffers en la GPU.

Por cuadro no hay trabajo extra: three.js recalcula las matrices de mundo de los hijos del hueso como con cualquier objeto. No hay `setState` ni cálculos en `useFrame` para el zapato.

## 5. El espejo del pie contrario

Un zapato izquierdo es la imagen especular de uno derecho respecto del plano que divide el pie a lo largo (plano sagital). En el espacio del avatar ese plano tiene normal X, así que el espejo es `scale.x = -1` en el grupo **mirror**, que está por encima de **orient**.

Ojo con el orden: el mismo `scale.x = -1` puesto directamente en la escena del zapato (espacio del zapato, punta en +X) daría vuelta la punta hacia el talón. En el espacio del zapato el espejo correcto sería `scale.z = -1`. Con la jerarquía de arriba basta con recordar: el espejo va en **mirror**, nunca en el nodo del GLB.

Comprobación: el exterior de un zapato derecho (+Z) pasa por orient a -X y por mirror a +X, que es el exterior del pie izquierdo. La punta (+X) pasa a +Z y el espejo en X no la cambia.

**Orden de los vértices (winding).** Una escala negativa invierte el sentido de los triángulos y, sin corrección, se verían las caras de atrás. three.js ya lo resuelve: el renderizador invierte `frontFace` cuando el determinante de la matriz de mundo es negativo (`matrixWorld.determinantAffine() < 0` en `WebGLRenderer`, three 0.187). Funciona igual con los modelos de una cara (Gazelle, Samba y Jordan 4 University Blue tienen `doubleSided: false`) y con los de dos caras. Las normales también quedan bien, porque la matriz normal es la inversa transpuesta.

**Tangentes.** Cinco modelos lite traen el atributo `TANGENT` y mapa de normales: Air Jordan 1, New Balance 997, Nike Air Uptempo, Nike Pegasus 36 y Adidas Sambae. El shader arma la bitangente con `cross(normal, tangente) * tangente.w`; con el espejo, ese producto cambia de signo y el relieve del mapa de normales se invierte en un eje (las costuras parecen hundidas en vez de salientes). Solución para la copia en espejo de esos cinco: clonar solo la geometría (los materiales y texturas siguen compartidos) y multiplicar `tangent.w` por -1, o quitar el atributo `TANGENT` para que three.js calcule la base con derivadas de pantalla, que ya respetan el espejo. Se hace una vez al cargar el modelo.

**Lo que el espejo no arregla.** Los logos y textos laterales asimétricos se ven invertidos en el pie contrario (letras al revés en un talón, por ejemplo). Es lo aceptado en la decisión 3 del plan. Si alguno se ve mal, la alternativa es extraer el otro zapato del original: la Air Jordan 1 viene en par en `assets/models/raw/` (`extractedFromPair`), así que el izquierdo real sale con el mismo `extract` cambiando el lado.

## 6. Calibración

### Punto de partida calculado

En reposo, el zapato debería quedar con la suela en el piso (y = 0), centrado bajo el pie y con la punta hacia +Z. Desde el manifiesto del avatar:

- `x` = traslación X del hueso del pie (positiva en el izquierdo, negativa en el derecho);
- `y` = 0;
- `z` = traslación Z del hueso del pie más un avance inicial de unos 7 cm. El tobillo queda sobre el tercio trasero del pie, y el origen del zapato está en el centro de la huella; `foot.ankleToToeBaseMeters` sirve de referencia.

### Desfases que ajusta la herramienta

Todos en ejes del avatar y aplicados al grupo **fit**. Se ajusta el pie derecho y el izquierdo se deriva por simetría, para que el par quede parejo:

| Desfase | Unidad | Pie derecho | Pie izquierdo | Qué corrige |
| --- | --- | --- | --- | --- |
| `offset.x` | m | dx | -dx | centrado lateral bajo el tobillo |
| `offset.y` | m | dy | dy | altura: suela en el piso, sin hundirse ni flotar |
| `offset.z` | m | dz | dz | avance: el talón del zapato bajo el talón del pie |
| `rotation.x` (cabeceo) | grados | p | p | inclinación punta y talón respecto del pie en reposo |
| `rotation.y` (apertura) | grados | y | -y | la apertura natural de los pies hacia afuera en la T-pose |
| `rotation.z` (rolido) | grados | r | -r | inclinación hacia adentro o hacia afuera |
| `scale` | factor | s | s | largo del zapato respecto del pie (el pie del Y Bot mide unos 26 cm a 1,75 m; el zapato, 30 cm) |

Estos valores son globales (iguales para todos los sneakers) gracias a la pose canónica compartida. Se guardan en un archivo versionado propio del proyecto (propuesta: `assets/avatar/fitting.json`), que no contiene nada de Mixamo.

### Ajuste por modelo (`avatarFit`)

Para los modelos que se salen de la media, un campo opcional `avatarFit` en la entrada del modelo en `scripts/models/config.mjs`, que `pnpm models:optimize` copia al manifiesto (como dice el plan, sección 4):

- `lift` (m): suelas altas. Sube el avatar entero y baja el zapato lo mismo, para que el zapato siga apoyado en el piso y el tobillo quede dentro de la caña. Candidatos por altura total: Adidas Prophere (15,7 cm de alto con su suela gruesa) y los Jordan 4.
- `scale` (factor): multiplica la escala global, para modelos que se ven largos o cortos en el pie.
- `forward` (m): suma a `offset.z`, para punteras largas o talones salientes.

### La herramienta

- Página solo de desarrollo, con el avatar en reposo y animado, un selector de modelo y controles numéricos para cada desfase (arrastre y teclado, sin depender del scroll).
- Una línea de tiempo para detener cada clip en un cuadro y revisar los momentos críticos: apoyo del talón y despegue de la punta en `walk`, el giro de `turn` y la pose final de `pose`.
- Ayudas visuales: el plano y = 0, los ejes del hueso del pie y una vista lateral fija.
- Guarda el JSON global y genera el bloque `avatarFit` del modelo para pegarlo en `config.mjs`.
- Revisión final a ojo en ambos temas con los pares del plan (sección 9): Jordan 4 (caña alta) y Samba (caña baja), más uno de suela alta (Prophere).

Queda por decidir si los textos de esa página van a `messages` como el resto del sitio (CLAUDE.md pide cero texto fijo) o si, al ser una herramienta de desarrollo que no llega a producción, se acepta una excepción.

## 7. El recorte del pie del avatar

`pnpm avatar:build` quita los triángulos cuyos tres vértices dependen de los huesos `LeftFoot`, `LeftToeBase`, `RightFoot` y `RightToeBase` con un peso sumado de 0,5 o más (`FOOT_TRIM` en `scripts/avatar/config.mjs`). El Y Bot es un maniquí por piezas, con anillos de articulación en una malla aparte (`Alpha_Joints`): el corte elimina la pieza del pie y parte del anillo del tobillo, que queda dentro del cuello del zapato. Como el zapato cuelga del hueso del pie y no de la malla, el recorte no cambia el anclaje.

Si con un zapato bajo (Samba) se ve un hueco entre la pierna y el cuello, se sube `minWeight` (0,7 a 0,9) para dejar más malla del tobillo y se vuelve a construir. La alternativa en tiempo de ejecución (escalar el hueso del pie a cero) no sirve aquí: también escalaría a cero el zapato colgado de ese hueso.

## 8. Rendimiento

- Zapatos en su versión hero (texturas de 2048 px, nítidos en el primer plano "Zapatos") y en `-lite.glb` solo en modo liviano, compartida entre los dos pies. El prefetch de las tarjetas del selector pide la misma variante que se monta. Con el hero, el avatar y el vestuario a 1720x816 el cuadro se mantiene en unos 16,7 ms (60 fps, M3 Pro).
- El avatar en su versión lite en modo liviano.
- Un solo lienzo dibujando, DPR máximo de 1,5 (1 en modo liviano) y render detenido fuera de vista, como el resto de las escenas.

## 9. Vestuario del maniquí

Prendas propias del proyecto (no son de Mixamo ni de ninguna marca), generadas por `pnpm avatar:build` con `scripts/avatar/outfit.py` en Blender. La configuración vive en `scripts/avatar/config.mjs` (`OUTFIT` y `OUTFIT_VARIANTS`).

- **Prendas con esqueleto** (camiseta, musculosa, short, pantalón jogger, calcetines): se toman las piezas del Y Bot cuyo hueso dominante está en la lista de la prenda, se inflan por la normal, se unen con un remallado de vóxeles, se suavizan y se cortan con planos limpios en cada dobladillo. Después: caída de la tela (el radio no se achica al bajar), holgura mínima sobre el cuerpo, capas (la camiseta va por fuera del short, el pantalón por fuera de los calcetines), canto del dobladillo (solidify solo borde) y pesos copiados del cuerpo y suavizados.
- **Calcetines:** de media pantorrilla al tobillo, cerrados dentro del zapato, con dos franjas en el puño (material `outfit-stripe`). Sin logos.
- **Accesorios rígidos** (gorra y lentes): geometría propia ajustada a la cabeza, hijos del hueso `mixamorig:Head`, sin pesos.
- **Archivos:** `outfit.glb` y `outfit-lite.glb`, aparte del avatar, con el mismo esqueleto y la misma pose y escala. La web enlaza cada prenda a los huesos del avatar por nombre. Sin las URLs (`NEXT_PUBLIC_OUTFIT_URL`), el Hangar muestra el maniquí sin ropa.
- **Cuerpo bajo la ropa:** las mismas reglas que cortaron las prendas (`apps/web/lib/avatar/outfit-rules.json`, generado) marcan en la web qué vértices del cuerpo quedan cubiertos, con un margen (`hideInset`) para que dentro de cada abertura se siga viendo cuerpo. Esos triángulos no se dibujan mientras la prenda está puesta.
- **Tela:** materiales mate de un color, sin UV ni texturas; en el hero, un relieve de tejido procedural en el shader que se apaga de lejos.

## 10. Ropa del catálogo en el maniquí

Paso 4, fase 3 (piloto): lentes de sol negros, sudadera Nike Club Fleece, anorak gris y sus pants, más tres gorras: NY 59FIFTY (la de fábrica del maniquí), NY negra y Adidas negra. Después se sumó el hoodie Adidas arena con camuflaje (brazos casi abiertos en el original: `pose.arms.down` 25). El hoodie Adidas negro y blanco queda solo de catálogo: sus mangas no son simétricas (ningún ángulo de brazos alinea las dos) y los paneles en capas de las axilas (Marvelous Designer) se abren hacia afuera. La gorra NY marino de visera curva, el primer piloto, se retiró del catálogo. `pnpm avatar:fit` (scripts/avatar/fit.mjs y fit.py en Blender) ajusta cada prenda con los valores de `scripts/avatar/fit.json`.

- **Entrada:** el GLB optimizado del producto (`apps/web/public/models/<slug>.glb`), en su pose canónica. Cualquier esqueleto o peso horneado se descarta (el anorak viene de un rig de MetaHuman).
- **Colocación:** escala y posición del borde inferior en metros del avatar (`position`, `scale`, `stretch` por eje).
- **De pose A a T-pose:** los modelos de Sketchfab vienen con los brazos abajo. Se pone el maniquí en esa pose (`pose.arms`, `pose.forearms`, `pose.legs`, en grados), se toman los pesos del cuerpo así posado y se deshace la pose con el skinning inverso. Con los brazos abajo de los clips, la prenda vuelve a su forma original.
- **Ajuste suave:** holgura mínima con el cuerpo (`clearance`), los vértices que flotan más de `maxGap` se acercan una fracción (`pull`) y el desplazamiento se suaviza sobre la malla. `subdivide` subdivide mallas livianas antes de ajustar; `shorten` acorta las piernas sin cortar el puño (el pantalón queda sobre el cuello del sneaker).
- **Capas:** los pantalones quedan por dentro de la camiseta y la musculosa base y por fuera de los calcetines; las sudaderas, por fuera de los shorts, el pantalón base y los pantalones del catálogo. Se mide sobre la normal del cuerpo.
- **Pesos:** del cuerpo en reposo (punto más cercano, interpolado en el triángulo, solo los huesos de la prenda), suavizados (`weightSmooth`), 4 por vértice y normalizados. `shoulderBlend` pasa la parte alta de la manga al hueso de la clavícula para que los hombros caídos no se levanten en punta.
- **Rígidos:** la gorra y los lentes se colocan respecto del centro de la cabeza, se separan de ella si la tocan y cuelgan del hueso `mixamorig:Head`. Las gorras usan escala uniforme (nunca `stretch`: se ven deformadas) y `seat.bandFront` (altura de la banda adelante, 0,015 m). Las 59FIFTY tienen la copa más atrás que el centro de su caja (la visera plana es larga): se adelantan con `position[2]` (0,035 m) y se escalan a 1,15 para que la cabeza alta del maniquí no asome por el frente ni por atrás. Los lentes quedan bajo la visera.
- **Salida:** `apps/web/public/avatar-fit/<slug>.glb` y `-lite.glb` (Meshopt, WebP, hero hasta 12k triángulos y unos 300 KB, lite hasta 5k y 160 KB) y `apps/web/lib/avatar/catalog-fit.json` con el lugar de cada prenda, las piezas base que reemplaza y las reglas para ocultar el cuerpo debajo. Los archivos solo contienen la prenda (modelo CC BY con su crédito) y los huesos: se versionan.
- **En la web:** el panel "Vestuario" ofrece "Del catálogo" por lugar; la prenda reemplaza su pieza base y conserva sus colores. El cuerpo bajo cada prenda no se dibuja (`components/hangar/body-mask.ts`, compartido con el vestuario base). `/hangar?wear=<slug>` abre el Hangar con la prenda puesta.

## 11. Zapato flotante

El maniquí ya no mete los pies en el sneaker: la pierna termina en la parte baja de la canilla con una tapa redondeada (como un maniquí de vitrina) y el par sigue colgado del hueso del pie, con el apoyo en el piso de siempre. El zapato queda entero a la vista (cuello, lengüeta y forro) y desaparecen los cruces con el cuello. Código: `components/hangar/leg-cut.ts` y `LegCaps.tsx`.

- **Altura del corte, por zapato:** al cargar el par se mide su punto más alto (cuello o lengüeta, `collarRing`). El corte queda 4 cm (`FLOAT_GAP`) por encima de ese punto, más el canto de la tapa, en el espacio del avatar en reposo y con la calibración del pie. Así una caña alta (Jordan 4, Uptempo) y una baja (Gazelle, Samba) muestran el mismo hueco. Nunca baja de 3 cm sobre el tobillo (`MIN_CUT`).
- **Corte en el shader:** cada vértice de la canilla y el pie (cuerpo, medias y pantalones, base o del catálogo) lleva el atributo `shin` (lado y altura en reposo sobre el tobillo, a lo largo de la canilla). Los materiales cortables descartan lo que queda por debajo del uniform `LEG_CUT`: el borde es un plano limpio que sigue a la pierna en cada clip, sin trabajo por cuadro. Las mallas sin el atributo (el short, que comparte material con el pantalón) no se cortan.
- **Tapa:** una por pierna, hija del hueso de la canilla. Su borde es la sección real, a la altura del corte, de la capa de más afuera que llega ahí (pantalón del catálogo, pantalón base, media o cuerpo) y usa su material: el pantalón cortado termina en un ruedo cerrado, la media en su color y el cuerpo desnudo en el tono de las articulaciones del maniquí. Se rearma al cambiar el par o la ropa.
- **Medias:** terminan en el corte con dos franjas del color de las franjas del puño (en el shader), además de las dos de arriba, solo si queda media a la vista (del corte a las franjas de arriba o al ruedo del pantalón) para que no se amontonen: con una caña alta (Jordan 4, Uptempo) quedan solo las de arriba (`BAND_ROOM`, 3,5 cm). Con pantalón (base o del catálogo), la media y sus franjas se ocultan desde 2 cm sobre el ruedo (`SOCK_TUCK`): lo que queda dentro de la tela nunca asoma a través de ella. Ya no hay relleno del tobillo (`AnkleFill.tsx` queda sin uso).
- **Caminar:** el primer plano de los zapatos se abre al caminar (de punta a talón hay hasta 1,2 m de perfil) para que los dos queden en cuadro en todo el ciclo. El clip es en el lugar, así que bajo el maniquí corre una cinta de líneas HUD (`WalkBelt.tsx`) hacia atrás a la velocidad del pie apoyado (1,5 m/s en el tiempo del clip, por la velocidad del clip), colgada de la plataforma; aparece y se va con el peso del clip y no se dibuja con movimiento reducido.
- **Pantalones:** si el ruedo queda por encima del corte no cambian; si llega más abajo (los pants del catálogo con una caña alta), se cortan a la altura del corte con su tapa.

## 12. Hangar centrado en los zapatos (funciones ocultas)

El Hangar muestra solo "Zapatos" y "Ropa", los chips Pose, Girar y Caminar (Pose al abrir) y una lista corta de prendas: las tres gorras, los dos hoodies Nike propios (el negro es el de fábrica), el anorak y los pants grises. Lo demás no se borró: queda oculto tras las banderas de `apps/web/lib/avatar/hangar-features.ts`, cada una con su comentario de cómo volver a encenderla.

- `HANGAR_FEATURES.baseOutfit`: el vestuario base de la sección 9 (outfit.glb). Apagado, no hay capa base: al quitar una prenda del catálogo se ve el cuerpo del maniquí (BodyMask libera su capa) y la tapa del corte usa el material de las articulaciones.
- `HANGAR_FEATURES.socks`: los calcetines y sus franjas (sección 11). Solo cuenta con el vestuario base.
- `HANGAR_FEATURES.colorsTab`: la pestaña "Colores".
- `HANGAR_FEATURES.resetToBare`: "Restablecer" deja el maniquí sin ropa con el mismo par.
- `HANGAR_CLIPS` y `DEFAULT_CLIP`: chips de animación y el clip inicial. El clip `idle` sigue en el GLB: "Girar" gira sobre él.
- `HANGAR_WEAR_ALLOWLIST`: prendas ofrecidas. Las demás ajustadas siguen en el catálogo, pero su ficha no enlaza al Hangar y lo guardado con ellas vuelve a la prenda de fábrica de ese lugar.

## 13. Hoodies Nike propios (prenda modelada sobre el maniquí)

El hoodie Nike Air negro (AS-A41, la parte de arriba por defecto del Hangar y del adelanto de la home) y el hoodie Nike blanco (AS-A40) no vienen de Sketchfab: son obra propia, generada por `pnpm garments` (`scripts/garments/`). La misma malla y el mismo ajuste sirven a los dos; cambian las texturas.

- **Geometría** (`hoodie.py`, en Blender): las piezas del torso y los brazos del Y Bot infladas 1,2 cm y unidas con un remallado de vóxeles, más un tronco de cono elíptico del pecho a la cadera. Después: corte del ruedo (0,895 m, en la cadera alta), de los puños y del escote; corte en A: desde la sisa (1,24 m) el radio de cada ángulo baja en línea recta, tangente al cuerpo, alrededor de un eje vertical fijo (nunca marca la cintura ni hace barriga en la cadera) con holgura casi pareja (0,3 cm en el pecho, 0,4 cm en el ruedo, menos a los costados, por donde pasan los brazos, sobre la holgura mínima de 1 cm): corte regular abajo, sin vuelo y ondas verticales suaves; mangas cerca del brazo con hombro caído (costura a 4,5 cm del hueso del brazo) que se afinan hacia el antebrazo (`sleeveTaper` 0,96: cada tramo arrastra solo 96 % del radio del anterior), apenas volumen sobre el puño y puño de canalé redondo (las primeras versiones, más infladas, se leían como una campera acolchada; el dueño pidió el tamaño del anorak gris, que el ajuste actual iguala: pecho de 28 cm de fondo, cintura de 32 x 30 cm); pliegues suaves en codos y espalda baja; ruedo y puños vuelven a su plano de corte (sin zigzag). Capucha baja: un rollo cerrado alrededor del cuello que se apoya en la prenda y cae en U sobre la espalda (13 cm al centro), con un rollo de 2,8 cm de grosor atrás. Bolsillo canguro como relieve de la misma malla (una capa aparte se cruzaba con el cuerpo al ajustar y dejaba triángulos oscuros) con pespunte y sombra de las aberturas en la textura; puños ceñidos a la muñeca; ojales de metal y cordones apoyados sobre la tela. Medidas en `scripts/garments/config.mjs`. Atlas: el frente y la espalda (estampados) ocupan 74 % del alto de la imagen, unos 2400 px por metro en 2048 px; las mangas quedan cerca de 1100 px por metro y la capucha, el bolsillo y los cordones (tela lisa) con lo que sobra.
- **UV y texturas** (`textures.mjs`, `prints.mjs`): un atlas de 2048 px (frente, espalda, mangas, capucha, bolsillo, cordones). Felpa con ruido procedural, canalé de 5 mm en ruedo y puños, costuras y pespuntes en relieve, estampados vectoriales propios (letras geométricas dibujadas a mano, sin fuentes del sistema). Crema (182, 178, 170: cerca del 70 %, cálido) con rugosidad 1 y sin emisión; en el Hangar la tela del catálogo con esqueleto usa envMapIntensity 0,45 y la cara interior se oscurece en el shader (`AvatarCatalog.tsx`), así nunca se ve más clara que la entresuela blanca de un sneaker, para que no brille con la luz de borde: panel negro con forma de home plate, contorno y swoosh lima (tokens de marca) en el pecho alto, justo bajo los cordones; swoosh negro en la espalda alta con "SWOOSH BY NIKE" en gris, todo dentro del panel plano de la espalda (unos 12 cm a cada lado del centro, para que nada se envuelva hacia los costados), y una etiqueta tejida en el ruedo. Negro: NIKE con swoosh, "A I R" y franjas grises al frente, bandas blancas en diagonal sobre los hombros y etiqueta "NIKE AIR" en el puño izquierdo.
- **Dos salidas**: la pose de exhibición (brazos 62° abajo, skinning lineal con los pesos del cuerpo) va a `assets/models/raw/<slug>.glb` y sigue el pipeline de modelos (pósters, créditos como obra propia); la T-pose va a `assets/garments/out/<slug>-rest.glb`, que `fit.json` nombra en `source`: el ajuste no deshace ninguna pose (`pose` vacío, `position` [0, 0, 0], escala 1), así calza exacto.
- **Ajuste** (`fit.json`): `maxGap` 0,2 (la tela no se tira hacia el cuerpo) y `hidesBottoms`. Sin simulación de tela, un ruedo largo y suelto se veía rígido al caminar (se abría como una campana sobre el muslo, la mano se hundía en él y pasar peso a los muslos rasgaba la malla): el ruedo queda en la cadera alta (0,895 m) y sigue solo al torso, sin influencia de las piernas. Con `hidesBottoms` la prenda no se deforma para pasar por fuera del pantalón (más ancho en la cadera); solo la banda del ruedo se abre lo justo (`cover_band`, `bandGap` 2 cm, suavizado entre ángulos y apagado hacia arriba) y, en la web, mientras la prenda está puesta no se dibuja la cintura del pantalón que queda 3 cm o más por encima del ruedo (`AvatarCatalog.tsx`, uniform `TOP_HEM` y atributo de alto en reposo). Solo se oculta lo que sigue a la cadera: los vértices con más de 25 % de peso de las piernas nunca se cortan, así al dar el paso no aparece un borde recto sobre el muslo. Texturas: a diferencia de las demás prendas, el hero ajustado conserva el color en 2048 px (lite 1024 px) con calidad WebP más alta (`VARIANT_OVERRIDES` en `fit.mjs`, presupuesto de 520 KB y 200 KB): las letras chicas de los estampados se veían borrosas de cerca en el teléfono. En el catálogo, el hero prueba primero calidad 94 en el color y deja normales y rugosidad en 1024 px (`OWN_HOODIE_VARIANTS` en `scripts/models/config.mjs`). Revisado en pose, giro y caminata (ráfagas de 10 cuadros), de frente, 3/4, lado y espalda, en 1720x816 y 390x844, en ambos temas, con las tres gorras, con los pants y sin pantalón.

## 14. Camiseta Nike Flight propia (la parte de arriba por defecto)

La camiseta Nike Flight negra (AS-A42, `camiseta-nike-flight-negra`) es la parte de arriba por defecto del Hangar y del adelanto de la home; los hoodies Nike siguen en la lista del Hangar, después de ella. Sale del mismo pipeline que los hoodies (`pnpm garments`): `scripts/garments/config.mjs` define `TEE` y `hoodie.py` recibe `--name tee` y modela sin capucha, bolsillo ni cordones.

- **Forma:** la base del hoodie (inflado de 1,2 cm, holgura mínima de 1 cm, corte en A desde la sisa) sin vuelo hacia el ruedo. Ruedo en la cadera alta (0,94 m) con un dobladillo liso de 2 cm; mangas cortas que terminan a media parte alta del brazo (`sleeveEnd` 0,32), abiertas y sin puño (`cuff: false`); cuello redondo de canalé, que es el mismo rollo de la capucha con 1,3 cm de alto y 4 mm de grosor (`collar`). Medida ajustada en el avatar: 0,360 x 0,310 m a 1,00 m de alto (el anorak gris: 0,354 x 0,306).
- **Ajuste** (`fit.json`): como los hoodies (`hidesBottoms`), con `bandGap` 0,8 cm y `bandBelow` 1 cm: la banda del ruedo solo mira 1 cm por debajo del borde para cubrir el pantalón, así abraza la cadera sin abrirse sobre los muslos (`cover_band` en `fit.py`; los hoodies siguen con 3 cm).
- **Estampado** (`prints.mjs`, todo vectorial y propio): atrás, la figura de un basquetbolista de perfil que sube a una bandeja (unos 25 cm: rodilla de adelante alta, pierna de atrás pateando hacia atrás, la pelota en la mano de adelante y el otro brazo atrás), un óvalo de salpicado con semilla fija (más denso cerca de la figura, algunas gotas estiradas en la dirección del salto, ninguna pegada a la figura) y "Flight" en cursiva de pluma ancha con un remate debajo, en amarillo dorado. La figura se arma desde un esqueleto con proporciones de persona (cápsulas que se afinan, cabeza de perfil, manos y zapatillas) y un filtro de desenfoque y umbral del alfa la funde en una sola silueta suave; un borde del color de la tela la separa del salpicado y no entra en la máscara del relieve. Al frente, la misma figura de 7 cm en el pecho izquierdo. El atlas le da a la espalda 62 % del ancho y todo el alto (unos 3000 px por metro); el ajuste al avatar conserva 2048 px en el hero y 1024 px en el lite (`VARIANT_OVERRIDES` en `fit.mjs`).
