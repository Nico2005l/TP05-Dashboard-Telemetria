# Documento técnico — Dashboard web de telemetría robótica

**TP05 · Desarrollo de Aplicaciones II · UADE**

---

## 1. Arquitectura

El sistema es cliente-servidor con una única frontera: la API HTTP/WebSocket
del backend de la cátedra. El backend es de sólo lectura y no se modificó.

```
  Simulador MuJoCo ──socket local──> backend FastAPI ──HTTP/WS──> dashboard
   (o robot real por DDS)              :8001                      (navegador)
```

**Endpoints consumidos.** `GET /info` en el arranque, para conocer la forma
del robot: cantidad de motores, nombres de motores y nombres de apoyos.
`GET /telemetria` en modo polling, o `WS /ws` en modo push, para los datos.
Los endpoints parciales (`/motores`, `/imu`, `/bms`, `/fuerzas`) no se usan:
`/telemetria` ya trae los cuatro subsistemas en un frame coherente, y pedirlos
por separado sería una foto de cada panel en un instante distinto.

**Estructura del frontend.** Cuatro capas, sin framework:

| Capa | Archivos | Responsabilidad |
|---|---|---|
| Configuración | `js/config.js` | direcciones, umbrales, tamaños de ventana |
| Transporte | `js/api.js`, `js/events.js` | hablar con el backend y emitir eventos |
| Estado | `js/store.js` | búfer circular de historia y muestras capturadas |
| Presentación | `js/panels/*.js`, `js/charts.js` | un archivo por panel |

`js/main.js` es el único que conoce todas las piezas a la vez. Ningún panel
sabe de dónde vienen los datos, y ningún transporte sabe qué se dibuja.

**Patrones aplicados.**

- *Observer*: los transportes emiten `telemetry` y `status`; los paneles se
  suscriben. Es lo que permite cambiar entre polling y WebSocket en caliente
  sin tocar un solo panel.
- *Adapter*: el backend ya normaliza Go2 (12 motores) y G1 (29) a un mismo
  JSON. El frontend agrega su propia adaptación por forma de robot: la tabla y
  el panel de apoyos se construyen a partir de `/info`, no de constantes.
- *Facade*: `/telemetria` como interfaz única de los cuatro subsistemas.
- *Strategy*, de hecho: `PollingTransport` y `SocketTransport` implementan la
  misma interfaz (`start`/`stop` más los dos eventos) y son intercambiables.

## 2. Decisiones de diseño

**Sin framework y sin build.** El TP no lo exige y sumar uno complica la
entrega: el dashboard se abre con doble clic. Se verificó que el backend
responde `Access-Control-Allow-Origin: *` incluso ante `Origin: null`, que es
lo que manda un archivo abierto desde el disco, así que funciona tanto por
`file://` como servido por HTTP. Por eso los módulos son scripts clásicos con
un namespace (`window.TP05`) y no módulos ES, que por `file://` estarían
bloqueados por CORS.

**Las filas de la tabla se crean una sola vez.** Después sólo cambia el texto
y el color de cada celda. Reconstruir 29 filas × 6 celdas diez veces por
segundo es trabajo de DOM tirado a la basura, hace imposible seleccionar el
texto y pierde la posición del scroll en cada frame.

**El gráfico nunca se recrea.** El `Chart` se instancia una vez; cada frame
hace `push` de un punto por serie, `shift` cuando se pasa de 300 muestras
(30 s a 10 Hz) y `update('none')`. Los datasets se rebobinan sólo cuando
cambia la *selección* de motores, y en ese caso la serie nueva se siembra con
la historia que ya tiene el store, así no arranca desde una línea vacía.

**Selector de motores.** Con 29 curvas superpuestas el gráfico no comunica
nada, así que se grafican hasta 6 series elegidas con checkboxes.

**Umbrales editables.** Los valores por defecto son los del enunciado (40 y
60 °C), pero son configurables porque la temperatura simulada tiene un techo
de 55 °C y la banda roja no se puede ejercitar de otra forma. El detalle está
en el anexo, punto 3.

**Estado del enlace como panel propio.** Dos señales: la que reporta el
transporte, y un *watchdog* que marca el enlace caído si el último frame tiene
más de 2 s, aunque el socket siga abierto. Se conservan los últimos valores en
pantalla, pero señalizados, nunca en silencio (anexo, punto 8).

**CSV armado en el navegador.** Las columnas son la *unión* de las claves de
todas las filas capturadas, no las de la primera: una sesión puede tener
filas de formas distintas (otro robot, otra cantidad de celdas) y quedarse con
la primera fila descartaría columnas sin avisar. Se exporta con BOM UTF-8 y
CRLF para que Excel abra bien los encabezados con acentos, vía `Blob` y
`URL.createObjectURL`, sin pasar por el servidor.

**Robustez.** Si Chart.js no carga desde el CDN, los paneles numéricos siguen
funcionando y se avisa; si `/info` falla, el dashboard lo dice y reintenta en
lugar de asumir que hay un Go2 del otro lado; si llega un frame de otro robot,
se descarta.

## 3. Polling vs. WebSocket para este caso

Medición propia, 15 s por cada modo, mismo backend en `--demo`, `localhost`:

| | REST polling 500 ms | WebSocket |
|---|---|---|
| Frames recibidos | 30 (2,0 Hz) | 148 (9,9 Hz) |
| Latencia | RTT media 5,4 ms · p95 8,7 ms · máx 20,3 ms | intervalo entre frames: media 101,9 ms · p95 103,1 ms |
| Tráfico | 2,8 kB/s | 13,8 kB/s |
| Payload por frame | 1 400 B (Go2) · 3 140 B (G1) | igual |

**Latencia.** El RTT del polling es bajísimo en `localhost`, pero no es la
métrica que importa: lo que importa es la *antigüedad* del dato en pantalla.
Con un intervalo de 500 ms, un valor puede tener hasta 500 ms más el RTT, y en
promedio 250 ms. Con el WebSocket la antigüedad media es de unos 50 ms, la
mitad del período de 100 ms con que publica el backend. Es un factor 5 y no
depende de la red: es el intervalo fijo.

**Muestras perdidas.** El backend publica a 10 Hz. Con polling cada 500 ms se
lee **1 de cada 5 frames**: el 80 % de los datos se descarta antes de llegar
al gráfico. Para una tabla de temperaturas da igual —la temperatura se mueve
lento— pero para el torque y para el estado de apoyos, que cambian con la fase
de la marcha, el polling literalmente no ve transiciones: el estado de apoyo
de una pata puede cambiar y volver a cambiar entre dos requests. Los mismos
300 puntos del búfer cubren 30 s por WebSocket y 150 s por polling, así que
además la ventana deja de ser la de 30 s que pide el enunciado.

**Carga.** El WebSocket mueve 4,9 veces más bytes, pero es una sola conexión y
un solo handshake: el polling paga cabeceras HTTP completas dos veces por
segundo, y en el servidor cada request es una entrada de log, una ejecución de
handler y un ciclo de conexión. A 10 Hz por polling —lo que haría falta para
igualar al socket— serían 10 requests/s por cliente, y el propio backend está
compartiendo la máquina con MuJoCo.

**Complejidad.** El polling son cinco líneas y no puede fallar de formas
raras: si un request se cae, el siguiente lo arregla. El WebSocket necesita
reconexión con backoff, detección de socket abierto pero mudo, y —según se
verificó— una dependencia extra en el servidor (`websockets`, anexo punto 2).
En este dashboard eso son unas 40 líneas en `SocketTransport` más el watchdog.

**Conclusión.** Para telemetría de robot el WebSocket es la opción correcta:
los datos son un flujo continuo a frecuencia conocida, la fuente decide cuándo
hay algo nuevo, y el consumidor quiere todo. El polling es preferible cuando
el dato cambia poco, cuando el consumidor quiere controlar la frecuencia, o
cuando hay proxies e infraestructura que no toleran conexiones largas. El
dashboard implementa los dos y arranca en polling: es el modo que funciona con
la instalación mínima que indica el TP.

---

Anexo con los hallazgos del entorno y su efecto en el desarrollo:
[`hallazgos-del-entorno.md`](hallazgos-del-entorno.md).
