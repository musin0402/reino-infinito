# REINO INFINITO — WebXR medieval procedural

Prototipo **3D jugable** para navegador y **Meta Quest 2 (Quest Browser)**. No necesita backend, cuentas, APIs privadas, servicios de pago ni proceso de compilación.

## Contenido

- `index.html`: página, import map de Three.js y botón ENTER VR.
- `style.css`: presentación y menú.
- `game.js`: renderizado, generación de terreno, bosques, montañas, ríos, ruinas, mandos y locomoción.

## Publicar GRATIS en GitHub Pages

1. Crea un repositorio público nuevo en GitHub, por ejemplo `reino-infinito`.
2. Sube **los tres archivos** (`index.html`, `style.css`, `game.js`) a la raíz del repositorio. Puedes incluir también este README.
3. Ve a **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Selecciona `main`, carpeta `/ (root)` y pulsa **Save**.
5. Cuando GitHub Pages indique que se publicó, abre `https://TU-USUARIO.github.io/reino-infinito/` desde el **navegador de Meta Quest 2**, no desde un visor del ordenador.
6. Pulsa **ENTER VR**. Confirma los permisos del navegador cuando te los solicite.

GitHub Pages sirve HTTPS, necesario para WebXR. Para el primer arranque se requiere internet para descargar Three.js desde jsDelivr; después el juego no necesita ningún servidor de juego.

## Controles

**Meta Quest 2**
- Joystick izquierdo: avanzar, retroceder y desplazamiento lateral según orientación de la cabeza.
- Joystick derecho izquierda/derecha: giro por saltos de 30°.
- Gatillo/grip no necesario para caminar; la espada se muestra en el mando derecho y sigue su movimiento.
- Botón secundario del mando izquierdo (cuando está disponible): correr.
- Movimiento físico: seguimiento 6DoF de cabeza y controladores.

**Ordenador**
- Botón **EXPLORAR EL REINO** o clic: activar ratón.
- Ratón: mirar.
- W/A/S/D o flechas: moverse.
- Shift: correr. Escape: soltar ratón.
- Espada visible en primera persona.

## Ejecución local (PC)

No abras `index.html` haciendo doble clic, porque algunos navegadores bloquean módulos ES desde `file://`.

Con Python instalado, desde la carpeta:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000` en el navegador del **PC**. Para Quest 2, usa **GitHub Pages con HTTPS**, no una dirección HTTP local de tu PC.

## Configuración rápida

Al principio de `game.js`, modifica `settings`:
- `RADIUS_VR: 2`: radio de sectores cargados en VR; recomendado Quest 2.
- `RADIUS_DESKTOP: 3`: radio de sectores en PC.
- `CHUNK: 48`: tamaño de cada sector en metros.
- `SEGMENTS: 24`: subdivisiones del terreno por sector.
- `WALK` / `RUN`: velocidad en m/s.
- `SEED`: cambia la semilla del paisaje.

## Alcance y limitaciones del prototipo

Incluye: mundo procedural determinista que se carga y descarga, terreno y alturas navegables, bosques instanciados, rocas, río sinuoso con valle, ruinas, luz y niebla, cámara en primera persona, WebXR, soporte de joysticks y espada unida al grip del controlador derecho.

Aún no incluye: físicas de colisión con árboles y edificios, combate real, enemigos, inventario, persistencia o sonidos. El jugador sigue la altura del terreno; es posible atravesar árboles y paredes. El paisaje es matemáticamente ilimitado, pero cada vez se renderizan solo los sectores próximos.

**Importante:** no se puede garantizar la tasa de FPS en todos los visores/firmwares sin pruebas físicas en Quest 2. Si experimentas tirones, reduce `RADIUS_VR` a `1` y/o `SEGMENTS` a `16`. El rendimiento dependerá de la versión de Quest Browser y del dispositivo.

## Dependencias

Three.js `0.170.0` cargado directamente desde `https://cdn.jsdelivr.net` mediante import map. No se instala `npm` ni se precisa empaquetador.
