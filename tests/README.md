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

`PORTFOLIO_SCREENSHOTS` es opcional. Las pruebas abren el HTML local en contextos de navegador aislados y usan únicamente los datos ficticios de Multi-Market. Cubren los cinco casos de estudio, traducciones, teclado, ausencia de JavaScript, movimiento reducido y viewports de 320 a 1440 px.

Multi-Market incluye búsqueda sin distinción de tildes o mayúsculas, catálogo ilustrado, precios y descuentos, filtros combinados, estado vacío, reset, combinaciones de rutas equivalentes del backend, consultas codificadas sin solicitudes de red y fichas de producto con foco, Escape y cierre por botón o fondo. Las capturas opcionales incluyen catálogo y ficha en escritorio y móvil.

La navegación se prueba con pantallas táctiles emuladas de 320×568, 390×844, 768×1024, 844×390, 1024×768 y 1366×1024. Se comprueban objetivos táctiles, menú al hacer scroll, cierre exterior/Escape, foco al cambiar de breakpoint y navegación sin JavaScript. La ficha de Multi-Market mantiene el cierre disponible en horizontal. Estas pruebas no sustituyen una revisión en dispositivos físicos o Safari.
