# 🎄 Lotería de Navidad · Los de la Última Fila

App web en **Google Apps Script** con base de datos en **Google Sheets** para la peña
«Los de la Última Fila».

- Cada uno apunta **nombre, número y dinero** (por defecto 20 € = un décimo; se puede jugar 10 €, 40 €…).
- El **22 de diciembre**, cada 5 minutos (de 8:00 a 18:00), descarga los premiados (fuente de la comunidad y, de respaldo, loteriasyapuestas.es).
- Calcula **lo que toca a cada número y a cada persona**: Gordo, 2º, 3º, 4º, 5º, **pedrea**, aproximaciones,
  centenas, dos últimas cifras y **reintegro**, con el **neto** tras Hacienda (20 % sobre lo que pase de 40.000 € por décimo).
- Botones para **compartir por WhatsApp**: la invitación con el enlace y, durante el sorteo, el resumen de premios.
- El número de participantes no tiene límite: es la gente que se apunte.

## Ficheros

| Fichero | Qué hace |
|---|---|
| `Code.gs` | App web (`doGet`), altas/bajas, lectura y escritura en la hoja, instalación (`configurar`) |
| `Premios.gs` | Reglas y cálculo de premios (sin dependencias de Google, se prueba con Node) |
| `Fuente.gs` | Descarga cada 5 minutos los resultados; `probarFuente` lo prueba con el sorteo de 2025 |
| `Index.html` | Interfaz (móvil primero) |
| `appsscript.json` | Manifiesto: zona horaria Madrid, app web pública |
| `test/premios.test.js` | Pruebas: `node test/premios.test.js` |

## Puesta en marcha (10 minutos)

1. Crea una hoja nueva en Google Sheets (p. ej. «Lotería Última Fila»).
2. **Extensiones → Apps Script**. Borra el `Código.gs` de ejemplo y crea estos ficheros copiando el contenido
   de este repositorio: `Code.gs`, `Premios.gs`, `Fuente.gs` (Archivo **+ → Secuencia de comandos**) e `Index`
   (Archivo **+ → HTML**; se llama `Index`, sin `.html`).
   En **Configuración del proyecto** marca «Mostrar el archivo de manifiesto appsscript.json» y pega el `appsscript.json`.
3. Elige la función **`configurar`** arriba y pulsa **Ejecutar**. Acepta los permisos.
   Esto crea las pestañas *Participantes, Extraccion, Estado, Config* y el **activador de cada 5 minutos**.
4. En la pestaña **Config** cambia como mínimo el **`ADMIN_PIN`** (y `ANIO` si hace falta).
5. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (así se puede abrir sin cuenta de Google desde WhatsApp)
6. Copia la URL `https://script.google.com/macros/s/…/exec`. **Ese es el enlace para el grupo de WhatsApp.**
   Dentro de la app, el botón «Invitar por WhatsApp» ya genera el mensaje con el enlace
   (también está en el menú de la hoja: 🎄 Lotería → Ver enlace para WhatsApp).

> Cuando cambies el código, usa **Implementar → Gestionar implementaciones → Editar → Nueva versión**
> para que el enlace siga siendo el mismo.

### Con clasp (opcional)

```bash
npm i -g @google/clasp && clasp login
cp .clasp.json.example .clasp.json   # pon el scriptId (Configuración del proyecto)
clasp push
```

## Configuración (pestaña `Config`)

| Clave | Valor por defecto | Para qué |
|---|---|---|
| `ANIO` | año actual | Año del sorteo |
| `NOMBRE_GRUPO` | Los de la Última Fila | Título de la app |
| `IMPORTE_DEFECTO` | 20 | € que aparecen por defecto al apuntarse |
| `MODO_REPARTO` | `individual` | `individual`: cada uno cobra lo de su número · `bote`: se suma todo y se reparte según lo que ha jugado cada uno |
| `ADMIN_PIN` | 1234 | Borrar participaciones y forzar la búsqueda de premios desde la app |
| `FUENTE` | `auto` | `manual` para no descargar nada y rellenar a mano la pestaña `Extraccion` |
| `ID_SORTEO` | vacío | Id interno de SELAE, por si la búsqueda automática fallara |
| `ALTAS_ABIERTAS` | `si` | Las altas se cierran solas cuando sale el primer número |

## Tabla de premios (por décimo de 20 €)

| Premio | € / décimo |
|---|---:|
| 1º · El Gordo | 400.000 |
| 2º | 125.000 |
| 3º | 50.000 |
| 4º (×2) | 20.000 |
| 5º (×8) | 6.000 |
| Pedrea (×1.794) | 100 |
| Aproximaciones 1º / 2º / 3º | 2.000 / 1.250 / 960 |
| Centena del 1º, 2º, 3º y de los 4º | 100 |
| Dos últimas cifras del 1º, 2º y 3º | 100 |
| Reintegro (última cifra del 1º) | 20 |

Los premios se acumulan. Si alguien juega otra cantidad, se paga proporcional (10 € → la mitad).

## De dónde salen los resultados

1. **Fuente principal:** el JSON público que mantiene la comunidad desde que El País cerró su API
   ([pclemente/NumerosLoteriaNavidad](https://github.com/pclemente/NumerosLoteriaNavidad)):
   `LoteriaNavidadResumen.json` (los 13 premios mayores) y `LoteriaNavidad.json` (lo que cobra cada número).
   La pedrea no viene marcada: la app la deduce (número que cobra 100 €/décimo más de lo que explican los premios mayores).
   Hasta que empieza el sorteo, esos ficheros traen el año anterior: la app solo los usa si son del `ANIO` configurado.
2. **Respaldo:** los servicios JSON de loteriasyapuestas.es (SELAE). En noviembre de 2026 responden **403** a Google,
   así que probablemente no sirvan.

**Prueba:** en el editor de Apps Script ejecuta `probarFuente` (usa el sorteo de Navidad de 2025, no escribe nada en la hoja).
Resultado en noviembre de 2026: la fuente de la comunidad funciona desde Google (13 premios mayores + 1.791 pedreas
deducidas de 1.794; el resto de premios cuadra exacto con su lista), SELAE da 403.

## Plan B si no llegan los resultados el día 22

1. En `Config` pon `FUENTE` = `manual`.
2. Apunta en la pestaña `Extraccion` los números (`Numero`, `Tipo`: PRIMERO, SEGUNDO, TERCERO, CUARTO, QUINTO, PEDREA).
   Basta con los premios principales y la pedrea de vuestros números: aproximaciones, centenas, terminaciones y reintegro
   se calculan solos.

La app se refresca sola cada minuto durante el sorteo (los datos se guardan en caché 30 segundos).
