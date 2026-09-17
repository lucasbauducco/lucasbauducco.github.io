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

`PORTFOLIO_SCREENSHOTS` es opcional. Las pruebas abren el HTML local en contextos de navegador aislados y usan únicamente los datos ficticios de la demo. Cubren filtros combinados, límites de períodos, totales exactos, reporte actualizado, estado vacío, reset, traducciones, teclado, ausencia de JavaScript, movimiento reducido y viewports de 320 a 1440 px.
