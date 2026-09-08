# Dashboard web de telemetría robótica — TP05

Frontend propio para el backend de telemetría de la cátedra (Unitree Go2 / G1).
Cuatro paneles en vivo —motores, IMU, batería y apoyos—, gráficos históricos,
captura de muestras y exportación CSV.

HTML + CSS + JavaScript sin framework y sin paso de build.

## Requisitos

En la máquina que corre el backend:

```bash
pip install fastapi uvicorn websockets mujoco
```

`websockets` **no es opcional** si se quiere usar el WebSocket: sin esa
librería `uvicorn` no sirve el protocolo y `/ws` responde 404. `mujoco` sólo
hace falta para el simulador con ventana 3D; para probar el dashboard alcanza
el modo `--demo`.

## Levantar el backend

Con simulador (abre la ventana 3D y el robot se pasea solo):

```bash
./INICIAR_TP05.sh
```

Sin simulador, con datos inventados — es el camino rápido para desarrollar:

```bash
python3 entorno/arrancar_api.py --robot go2 --demo --puerto 8001
```

El script imprime la dirección a la que hay que apuntar. Verificar que
responda antes de abrir el dashboard:

```bash
curl http://127.0.0.1:8001/info
```

## Abrir el dashboard

Doble clic en `dashboard.html`, o servido por HTTP:

```bash
python3 -m http.server 5500
```

y abrir `http://127.0.0.1:5500/dashboard.html`.

Las dos formas funcionan: el backend manda `Access-Control-Allow-Origin: *`,
así que el `fetch` desde `file://` no queda bloqueado por CORS.

## Parámetros de la URL

| Parámetro | Para qué |
|---|---|
| `?host=10.0.0.5` | IP del backend (la que imprime el script) |
| `?port=8002` | puerto del backend |
| `?transporte=websocket` | arrancar en modo push en vez de polling |
| `?amarillo=36&rojo=41` | mover los umbrales del semáforo de temperatura |

Todo eso también se cambia desde la barra de controles. Ejemplo, apuntando al
G1 de un segundo backend, en modo push:

```
dashboard.html?port=8002&transporte=websocket
```

## Estructura

```
dashboard.html          entrada
css/dashboard.css
js/config.js            direcciones, umbrales, tamaños de ventana
js/events.js            emisor de eventos (Observer)
js/api.js               transportes: polling REST y WebSocket
js/store.js             búfer circular de 300 muestras + muestras capturadas
js/charts.js            envoltorio de Chart.js (nunca recrea el gráfico)
js/panels/motors.js     tabla + semáforo de temperatura + gráfico histórico
js/panels/imu.js        roll/pitch/yaw, horizonte artificial, gráfico
js/panels/bms.js        carga, corriente, temperatura, celdas
js/panels/feet.js       apoyos, según lo que reporta /info
js/panels/connection.js estado del enlace y watchdog de antigüedad
js/csv.js               exportación CSV en el navegador
js/main.js              arranque y cableado
docs/                   documento técnico y anexo de hallazgos
entregables/            CSV de sesión y capturas de pantalla
```

## Notas del entorno

El paquete de la cátedra difiere en varios puntos del enunciado en PDF: el
puerto es 8001 y no 8000, no hay HTML base, el G1 no reporta las cuatro patas,
no se puede cambiar de robot desde el frontend y la temperatura simulada nunca
llega a los 60 °C del semáforo. Cada punto está documentado, con evidencia y
con la decisión de diseño que provocó, en
[`docs/hallazgos-del-entorno.md`](docs/hallazgos-del-entorno.md).
