# Licencia Chile

PWA educativa para estudiar y practicar el examen de licencia de conducir en Chile. Funciona desde el navegador, se puede instalar en Android o iPhone y queda disponible sin conexión después de la primera carga.

## Funciones

- Simulacros para clases B, C, CR, A1, A2, A3, A4, A5, D, E y F.
- Formatos de puntaje diferenciados por clase.
- Temporizador calculado con tiempo real y alertas de actualización.
- 140 preguntas originales con explicación inmediata.
- Práctica por temas y repaso de preguntas falladas.
- 24 tarjetas de señales de tránsito.
- Checklist del trámite municipal.
- Guía del examen práctico B, C/CR y profesional.
- Progreso, racha, exportación e importación de datos.
- Tema claro/oscuro, diseño responsive y soporte de teclado.

La aplicación no reproduce el banco oficial de CONASET y no promete aprobar. Es una herramienta de apoyo; la municipalidad administra el examen real.

## Ejecutar localmente

```bash
npm run dev
```

Abre `http://localhost:4173`.

No hay dependencias de producción. Se requiere Node.js 18 o superior.

## Verificar

```bash
npm run check
npm test
```

Las pruebas validan el banco de preguntas, los perfiles de examen, el puntaje, la persistencia, el HTML, el manifest y el service worker.

## Publicación

El repositorio incluye GitHub Actions para ejecutar las pruebas y publicar la carpeta raíz en GitHub Pages.

- App: `https://traderxael.github.io/licencia-chile-app/`
- Workflow: `.github/workflows/pages.yml`

## Fuentes oficiales

- [CONASET — Mejores conductores](https://mejoresconductores.conaset.cl/)
- [ChileAtiende — Licencias de conducir](https://www.chileatiende.gob.cl/fichas/20592-licencias-de-conducir)
- [ChileAtiende — Clase B](https://www.chileatiende.gob.cl/fichas/24065-licencia-de-conducir-no-profesional-clase-b)
- [ChileAtiende — Clase A](https://www.chileatiende.gob.cl/fichas/24034-licencia-de-conducir-profesional-clase-a)
- [CONASET — Legislación](https://www.conaset.cl/legislacion)

## Privacidad

El progreso se guarda en `localStorage` en el dispositivo. La app no incluye cuentas, analítica, publicidad ni envío de datos personales.

## Estructura

```text
licencia-chile/
├── index.html
├── styles.css
├── app.js
├── core.js
├── data.js
├── sw.js
├── server.js
├── manifest.webmanifest
├── icons/
├── tests/
└── .github/workflows/pages.yml
```

## Licencia

MIT. Consulta `LICENSE`.
