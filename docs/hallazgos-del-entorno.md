# Anexo — Hallazgos del entorno y su efecto en el desarrollo

Este anexo documenta las diferencias verificadas entre el enunciado del TP05 y
el entorno que efectivamente provee la cátedra
(`UadeRobotLab/05LaboratoriosTPs/TP05_Desarrollo_de_Aplicaciones_II`), y qué
decisión de diseño tomó el dashboard frente a cada una.

No es una lista de quejas: cada punto cambió código concreto, y los que no se
pueden resolver desde el frontend quedan explicitados para que no se lean como
un panel a medio hacer.

Todas las mediciones se hicieron contra el backend en modo `--demo`, sobre
`http://127.0.0.1:8001` (Go2) y `http://127.0.0.1:8002` (G1).

---

## 1. Los archivos del enunciado no son los del paquete

El enunciado nombra tres archivos provistos: `robot_telemetry_server.py`,
`tp05_dashboard_base.html` y `tp05_api_docs.pdf`. Ninguno existe en el
repositorio.

Lo que hay:

| Enunciado | Paquete real |
|---|---|
| `robot_telemetry_server.py` (un archivo) | `entorno/api/` — `telemetry_server.py`, `telemetry_adapter.py`, `telemetry_reader.py`, `config.py` |
| `tp05_api_docs.pdf` | `API.md` |
| `tp05_dashboard_base.html` | no existe |
| puerto 8000 | **8001** (`config.py`, `API_PORT = 8001`) |
| demo con `math.sin` | simulador **MuJoCo** cinemático, con el robot paseándose solo |

**Efecto en el desarrollo.** No hubo HTML base que completar: la estructura,
los estilos y el armado de los paneles se hicieron desde cero. La dirección
del backend no quedó fija en el código: `js/config.js` la define y la barra de
controles y la query string (`?host=`, `?port=`) la sobreescriben, porque el
script de arranque imprime la IP de la máquina y en el laboratorio no va a ser
`127.0.0.1`.

---

## 2. `/ws` devuelve 404 con la instalación que indica el TP

El enunciado y `INSTALACION.md` indican `pip install fastapi uvicorn`. Con
exactamente eso, el endpoint WebSocket no existe:

```
$ curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
       -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
       http://127.0.0.1:8001/ws
HTTP/1.1 404 Not Found
{"detail":"Not Found"}
```

`uvicorn` sin extras no incluye ninguna implementación del protocolo
WebSocket, así que la ruta no se sirve. Después de `pip install websockets` el
mismo handshake responde `101 Switching Protocols`.

Esto es relevante porque el WebSocket es uno de los objetivos específicos del
TP: siguiendo la instalación al pie de la letra, la extensión no se puede
implementar y el síntoma (un 404 en una ruta que sí está en el código) no
apunta a la causa.

**Efecto en el desarrollo.** Está en el README como requisito de instalación
(`pip install fastapi uvicorn websockets`), y el transporte WebSocket reporta
el cierre del socket como pérdida de conexión en lugar de quedarse callado,
que es lo que hacía difícil diagnosticarlo.

---

## 3. El semáforo rojo es inalcanzable

El enunciado fija los umbrales en verde < 40 °C, amarillo 40–60 °C, rojo
> 60 °C. La temperatura de motor nunca llega ahí:

- **Simulador**: `entorno/sim/telemetria.py` define
  `TEMPERATURA_MAXIMA = 55.0`. Es el valor al que *tiende* con esfuerzo
  sostenido, no un pico: 55 °C es el techo absoluto.
- **Modo `--demo`**: `telemetry_reader_dds.py` genera
  `34 + int(9 * (1 + sin(...)) / 2)`, o sea **34 a 43 °C**.

Medido sobre los 12 motores del Go2 y los 29 del G1 en `--demo`, el máximo
observado fue 43 °C. La banda roja del enunciado no se puede ejercitar con
ninguno de los dos robots ni en ninguno de los dos modos.

**Efecto en el desarrollo.** Los umbrales son configurables en tiempo de
ejecución: `js/config.js` los define, la barra de controles los edita y la
query string los sobreescribe (`?amarillo=36&rojo=41`). Los valores por
defecto son los que pide el enunciado — 40 y 60 — así que el comportamiento
prescrito es el que se ve al abrir el dashboard; bajarlos es lo que permite
verificar la lógica de la banda roja, y así se generó la captura
`03_semaforo_rojo_umbral_bajado.png`.

La alternativa era dejar los umbrales fijos y entregar un semáforo con una de
sus tres bandas nunca probada. Se prefirió que el estado rojo fuera
demostrable.

---

## 4. El G1 no reporta FR / FL / RR / RL

El enunciado pide un panel con indicadores de contacto para las cuatro patas
FR, FL, RR y RL. Eso es el Go2. En `entorno/api/config.py`:

```python
"go2": { ..., "patas": ["FR", "FL", "RR", "RL"] },
"g1":  { ..., "patas": ["R_foot", "L_foot"] },
```

`telemetry_adapter.py` construye el diccionario `fuerzas` haciendo `zip` contra
esa lista, así que el JSON del G1 trae **dos** claves y con otros nombres:

```
GET :8001/telemetria -> "fuerzas": {"FR":1,"FL":1,"RR":0,"RL":1}
GET :8002/telemetria -> "fuerzas": {"R_foot":1,"L_foot":1}
```

`LEEME_ESTUDIANTE.md` lo dice de pasada: «Qué patas están apoyadas (sólo
Go2)».

**Efecto en el desarrollo.** El panel de apoyos no tiene las cuatro patas
escritas en el código. Lee `patas` de `GET /info` y arma un indicador por
cada una. Si las cuatro claves son las del Go2, las dibuja como una vista
desde arriba del robot (frente arriba); con cualquier otra lista cae a una
fila de indicadores. Con las cuatro patas hardcodeadas, el panel quedaba
vacío en el G1.

Lo mismo vale para la tabla de motores: la cantidad de filas y los nombres
(`FR_hip`, `L_knee`, …) salen de `/info`, no de una constante.

---

## 5. No se puede cambiar de robot desde el dashboard

`telemetry_server.py` responde `409 Conflict` si se pide un modelo distinto al
que se levantó:

```
$ curl "http://127.0.0.1:8001/telemetria?modelo=g1"
{"detail":"El servidor esta conectado a go2, no a g1"}   # HTTP 409
```

El robot se elige al arrancar `INICIAR_TP05`, y el backend queda atado a esa
instancia. Un selector de modelo en el frontend no es implementable: para ver
el otro robot hay que levantar otro backend.

**Efecto en el desarrollo.** No hay selector de robot. En su lugar el
dashboard se adapta a lo que le dice `/info`, y la dirección del backend es
editable para poder apuntar a una segunda instancia. Las capturas de Go2 y G1
se tomaron contra dos backends simultáneos, en los puertos 8001 y 8002. El
parámetro `modelo` de `/telemetria` nunca se manda, justamente para no
provocar el 409.

Además, cada frame se compara contra el modelo del perfil antes de pintarlo:
si llega telemetría de otro robot, se descarta en lugar de mezclarse con la
tabla en pantalla.

---

## 6. El ejemplo de `API.md` no coincide con el código

`API.md` documenta la respuesta de `/telemetria` así:

```json
"bms": { "soc": 86, "corriente": 0, "temperatura": 0.0, "celdas": [] }
```

Lo que devuelven las dos fuentes reales es otra cosa:

| Campo | `API.md` | Simulador (`sim/simulador.py`) | `--demo` (`telemetry_reader_dds.py`) |
|---|---|---|---|
| `celdas` | `[]` | 10 celdas, **todas iguales** (`3700 + (soc-50)*4` mV) | 8 celdas que sí varían |
| `corriente` | `0` | `-1200` en movimiento, `-300` quieto (negativo = descarga) | `1100 ± 350` (positivo) |
| `temperatura` | `0.0` | fijo en `30` | `31 ± 2` |

**Efecto en el desarrollo.** El panel de BMS no asume ni la cantidad de celdas
ni el signo de la corriente. La grilla de celdas se construye según el largo
del array que llega y se reconstruye sólo cuando ese largo cambia; con un
array vacío muestra «La fuente no reporta voltajes de celda» en lugar de una
grilla en blanco. La corriente se muestra en valor absoluto con la dirección
como etiqueta («descarga» / «carga»), que es más legible que un signo menos.

También por esto el panel muestra la **dispersión** entre celdas: contra el
simulador da 0.000 V porque las diez celdas son idénticas, y ese cero es
justamente el dato que avisa que ahí no hay una medición.

---

## 7. Qué campos son planos, y por qué no es un error del dashboard

`API.md` y el docstring de `sim/telemetria.py` son explícitos: el simulador es
cinemático y varios campos están derivados. En `--demo` la degeneración es
mayor todavía. Medido:

| Campo | En `--demo` |
|---|---|
| `roll` | **fijo en 0.00** — el cuaternión sólo rota sobre un eje |
| `yaw` | **fijo en 0.00** |
| `pitch` | oscila ±2.3 ° |
| `celdas` | 8 celdas, dispersión ~0.03 V |

Contra el simulador MuJoCo los tres ángulos se mueven (roll y pitch como
oscilación de la marcha, yaw real), pero las celdas pasan a ser idénticas.

**Efecto en el desarrollo.** El horizonte artificial del panel IMU exagera la
inclinación ×4, porque con una oscilación de dos grados no se ve nada. Está
comentado en el código para que no se confunda con una escala real. Y el
gráfico del IMU dibuja las tres curvas siempre, incluso las que quedan
planas: una serie ausente sería indistinguible de un bug, una serie plana
declarada es información.

---

## 8. El `catch` vacío del código de ejemplo esconde la caída

El fragmento de referencia del enunciado termina así:

```js
} catch { /* sin conexión — mantener últimos valores */ }
```

Un dashboard construido sobre eso sigue mostrando los últimos valores para
siempre, sin ninguna diferencia visible entre datos vivos y una pantalla
congelada. Uno de los criterios de evaluación es justamente que el dashboard
avise cuando pierde conexión.

**Efecto en el desarrollo.** El estado del enlace es un panel propio con dos
señales independientes:

1. el estado que reporta el transporte (`connecting` / `online` / `offline`);
2. un *watchdog* de antigüedad: si el último frame tiene más de 2 s, el enlace
   se marca caído **aunque el socket siga abierto**, porque un socket vivo que
   dejó de mandar frames también es una pérdida de telemetría.

Se mantienen los últimos valores en pantalla —tirarlos no ayuda a nadie— pero
con el badge en rojo, el detalle del error, la antigüedad de la última muestra
y un borde rojo en la barra superior. Ver `04_perdida_de_conexion.png`.
