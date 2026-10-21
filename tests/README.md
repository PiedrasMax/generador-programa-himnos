# Pruebas de repeticiones mensuales

Base de comparación: `73fc69a4ce463444d76fe5b2e846170d9dcd87e5`.

## Detector (sin dependencias)

Desde la raíz del repositorio:

```sh
node --test tests/repeticiones.test.cjs
node --check app.js
```

Las pruebas ejecutan el código real de `app.js` en un contexto Node con el DOM inicial y fetch simulados. Comprueban todas las ocurrencias, funciones opcionales y del mismo día, separación por mes/año/himnario, ceros iniciales decimales, sufijos, vacíos, fechas inválidas y ausencia de mutaciones. No simulan el DOM de los flujos de usuario.

## Flujos de navegador y PDF (opcional)

```sh
node tests/flujos.cjs
```

Requiere Microsoft Edge instalado, acceso a los CDN de jsPDF 2.5.1 y AutoTable 3.5.23 declarados por la aplicación, y estos paquetes de desarrollo disponibles para Node:

- Playwright 1.62.1
- pdfjs-dist 5.6.205
- @napi-rs/canvas 0.1.100

La verificación original usó Node 24.19.0 y las dependencias ya incluidas en el runtime de Codex; no se instalaron dependencias en el proyecto. En otros equipos, se pueden proporcionar estos paquetes en un entorno de desarrollo separado mediante NODE_PATH. Los paquetes no son necesarios para usar el sitio.

El script inicia un servidor sólo en 127.0.0.1, usa un perfil temporal de Edge, compara con `git show <base>:app.js` y termina el navegador y servidor. El commit base debe estar disponible en el historial local. No usa sesiones personales, credenciales ni servicios de escritura remota. La ejecución captura `jsPDF.save` para conservar bytes reales del PDF sin abrir diálogos ni descargar en carpetas personales.

Cubre carga progresiva y completa, edición y cancelación sin mutar estado, guardado con lista activa, cambio de mes, agregado y borrado, Colaborador y portapapeles, búsqueda, retorno entre modos, reimportación, números alfanuméricos, renderización segura del aviso y fallo de catálogo. Verifica el aviso y el botón disponible a 390 px.

La comparación del PDF usa los mismos datos en ambas versiones: 12 servicios, las 13 funciones, estrofas, sufijos, encabezado, ensayos y PNG de marca de agua; compara seis páginas, texto, posiciones y píxeles. Los datos de comparación se fijan directamente en el estado para aislar el generador del parser; la importación real se verifica en los demás casos.

Las evidencias se escriben en `../evidencia-himnos/`, fuera del código del sitio: `resultado-flujos.json`, PDF base/mejora, PNG de cada página y captura móvil. Los archivos se sobrescriben al repetir la prueba. No son archivos necesarios para publicar.

## Alcance y reversión

La identidad del himno se compara por himnario y número; las estrofas y el nombre no cambian la identidad. Los servicios con fecha inválida se avisan por separado y no se asignan a un mes. Las advertencias nunca bloquean la exportación ni se agregan al PDF.

La vista previa del editor reemplaza un servicio en un arreglo temporal, sin guardar automáticamente. El PDF utiliza los servicios guardados. Se conserva el intercambio #SD y el acumulado de importaciones.

Se mantienen deliberadamente las declaraciones duplicadas existentes y los problemas previos del período/encabezado: esta mejora modifica sólo las últimas declaraciones efectivas. La única corrección adicional es usar `getNumeroCampo()` al guardar el editor, para que se guarde el mismo número activo que se valida.

Para revisar los cambios:

```sh
git diff 73fc69a4ce463444d76fe5b2e846170d9dcd87e5..mejora/aviso-himnos-repetidos
git -c core.whitespace=cr-at-eol diff --check 73fc69a4ce463444d76fe5b2e846170d9dcd87e5..HEAD
```

La opción `cr-at-eol` respeta los CRLF que ya tienen los archivos originales.

Para revertir una integración, crear un commit de reversión con `git revert <commit-de-la-mejora>` en una rama de corrección, revisar el diff y publicar por el proceso habitual. Si se integra mediante un merge, revertir el commit de merge con `git revert -m 1 <merge>` después de verificar su primer padre. No usar reset ni push forzado. Repetir las pruebas y comprobar GitHub Pages tras cualquier publicación o reversión.
