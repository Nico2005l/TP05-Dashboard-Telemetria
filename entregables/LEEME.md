# Entregables

## Capturas

| Archivo | Qué muestra |
|---|---|
| `capturas/01_go2_cuatro_paneles.png` | Go2 por WebSocket, los cuatro paneles con datos, semáforo verde y amarillo, gráficos con 30 s de historia |
| `capturas/02_g1_29_motores.png` | G1: 29 motores en la tabla y dos apoyos (`R_foot` / `L_foot`), armados desde `/info` |
| `capturas/03_semaforo_rojo_umbral_bajado.png` | Las tres bandas del semáforo a la vez, con los umbrales en 36/41 °C — con los 40/60 del enunciado la banda roja es inalcanzable (ver anexo, punto 3) |
| `capturas/04_perdida_de_conexion.png` | Backend caído: badge en rojo, causa del error y reintento automático |
| `capturas/05_captura_de_muestras.png` | Sesión con 12 muestras capturadas y la exportación habilitada |

## CSV

| Archivo | Contenido |
|---|---|
| `telemetria_go2_sesion_demo.csv` | 12 muestras del Go2 · 73 columnas |
| `telemetria_g1_sesion_demo.csv` | 10 muestras del G1 · 139 columnas |

Columnas: `capturado_en`, `motivo`, `modelo`, `ts`, IMU (`roll`, `pitch`,
`yaw`, `ax`, `ay`, `az`), BMS (`bms_soc`, `bms_corriente`, `bms_temperatura`,
`celda_N_v`), los cuatro valores de cada motor (`m<id>_<nombre>_angulo`,
`_velocidad`, `_torque`, `_temperatura`) y un `pata_<nombre>` por apoyo.

La diferencia de ancho entre los dos archivos —73 contra 139 columnas— es la
razón por la que el CSV se arma con la unión de las claves de todas las filas
y no con las de la primera.

Formato: UTF-8 con BOM y fin de línea CRLF, para que Excel abra bien los
encabezados con acentos.
