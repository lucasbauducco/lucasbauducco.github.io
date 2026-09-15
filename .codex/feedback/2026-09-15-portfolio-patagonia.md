# Feedback — Portfolio Patagonia digital bilingüe

Fecha: 2026-09-15

## Contexto

Se rediseñó el portfolio estático para orientarlo a reclutadores y desarrolladores, con identidad Patagonia digital, contenido español/inglés y una presentación explícita del flujo de desarrollo asistido por IA.

## Hallazgos

### Entorno de verificación móvil

- Síntoma: la primera captura solicitada con Chrome headless a 390 px apareció recortada horizontalmente.
- Causa observada: el modo de captura por línea de comandos conservó un viewport de layout mayor que el ancho físico solicitado.
- Evidencia: una verificación posterior mediante Chrome DevTools Protocol fijó `innerWidth=390` y devolvió `horizontalOverflow=false`.
- Consecuencia evitada: no se modificó el CSS para compensar un falso positivo producido por la herramienta de captura.
- Corrección del proceso: para validar breakpoints menores a 500 px con Chrome headless en este entorno, usar emulación de métricas mediante CDP y comprobar `scrollWidth > clientWidth`, además de revisar una captura.

### Comandos de búsqueda en PowerShell

- Síntoma: dos expresiones regulares complejas destinadas a buscar sinks dinámicos fallaron por escape de comillas y paréntesis.
- Causa observada: composición frágil de una expresión con alternancias dentro del comando PowerShell.
- Corrección del proceso: el gate final trasladó esas comprobaciones a un script Node leído por stdin, con búsquedas literales y código de salida confiable.
- Resultado: no se detectaron `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` ni `eval(` en el documento.

### Interpretación de códigos de salida en PowerShell

- Síntoma: el primer intento de commit se detuvo indicando diferencias unstaged aunque `git diff` estaba vacío.
- Causa observada: se usó la salida textual vacía de `git diff --quiet` como condición booleana; PowerShell no convirtió el código de salida del proceso externo en el resultado esperado.
- Evidencia: `git status` mostró los cuatro archivos únicamente en staging y `git diff --stat`, `--numstat` y `--name-status` no devolvieron diferencias del worktree.
- Corrección del proceso: evaluar `$LASTEXITCODE` inmediatamente después de ejecutar comandos externos silenciosos como `git diff --quiet`.

## Cambios aplicados

- No se modificaron skills ni instrucciones globales.
- Se fortaleció el selector de idioma para que el `aria-label` del menú respete simultáneamente el idioma y su estado abierto/cerrado.
- El plan ejecutable quedó actualizado con evidencia y estado `done`.

## Lo que funcionó

- La selección visual previa evitó implementar una estética no acordada.
- La página mantiene una versión española útil incluso sin JavaScript.
- Un checker Node validó en conjunto sintaxis JavaScript, traducciones, IDs, recursos locales, enlaces vacíos y protección de enlaces externos.
- La prueba de navegador cubrió el cambio ES/EN, persistencia tras recarga, menú móvil, tecla Escape, retorno de foco y ausencia de overflow a 390 px.

## Validación

- 79 claves traducibles completas en ES y EN.
- 17 IDs únicos.
- 8 referencias locales existentes.
- `git diff --check`: sin errores de whitespace.
- Chrome CDP: idioma inglés persistido después de recargar.
- Chrome CDP a 390 px: sin desborde horizontal; menú abre, cierra con Escape y devuelve el foco.

## Próximos pasos

- Revisar el texto profesional y el CV descargable antes de publicar para confirmar que reflejan el perfil actual.
- Crear el commit con `$crear-commit` cuando Lucas apruebe visualmente el resultado.
