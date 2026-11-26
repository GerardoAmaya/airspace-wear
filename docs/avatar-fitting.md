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

- Zapatos siempre en su versión `-lite.glb` (CLAUDE.md), compartida entre los dos pies.
- El avatar en su versión lite en modo liviano.
- Un solo lienzo dibujando, DPR máximo de 1,5 (1 en modo liviano) y render detenido fuera de vista, como el resto de las escenas.
