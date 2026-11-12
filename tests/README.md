# Pruebas del portfolio

La web es estática y no requiere build. Estas pruebas usan `node:test`, Chrome y una instalación existente de Playwright; no descargan paquetes ni navegadores.

Si `playwright` ya se resuelve desde Node:

```powershell
node --test tests/portfolio.test.cjs
```

Si Playwright está instalado fuera del proyecto, indicar la ruta del paquete:

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:\ruta\a\node_modules\playwright'
$env:PORTFOLIO_SCREENSHOTS = '.codex/validation/portfolio'
node --test tests/portfolio.test.cjs
```

`PORTFOLIO_SCREENSHOTS` es opcional. Las pruebas abren el HTML local en contextos de navegador aislados. Cubren el hero Patagonia y su ruta de tres hitos, los seis casos de estudio, traducciones, teclado, ausencia de JavaScript, movimiento reducido y viewports de 320 a 1440 px.

La navegación se prueba con pantallas táctiles emuladas de 320×568, 390×844, 768×1024, 844×390, 1024×768 y 1366×1024. Se comprueban objetivos táctiles, menú al hacer scroll, cierre exterior/Escape, foco al cambiar de breakpoint y navegación sin JavaScript. Estas pruebas no sustituyen una revisión en dispositivos físicos o Safari.

La carta privada se prueba con contenido ficticio cifrado en memoria. La suite nunca necesita ni imprime la clave real: comprueba AES-256-GCM, manipulación del ciphertext, hashes ajenos, claves inválidas, apertura con teclado, movimiento reducido y limpieza de object URLs. Los originales y el enlace completo deben permanecer bajo rutas ignoradas; sólo los archivos `.enc` se versionan.
