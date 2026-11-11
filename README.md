# Pa'llevar

Comida latina casera, to go, en Limerick (Irlanda). Página de pedidos: menú de la semana, platillo del día y formulario que manda el pedido por WhatsApp.

- `index.html`: la página completa.
- `img/`: fotos de los platillos (recorte circular, WebP).
- El número de WhatsApp está en la constante `WA_NUMBER` dentro de `index.html`.
- El menú de la semana está en la constante `MENU` (lunes a viernes) y los textos de cada platillo en `DISHES`.
- `automatizacion/`: Google Apps Script que guarda cada pedido en Google Sheets y manda el resumen diario a la cocina (instrucciones en `automatizacion/README.md`).
- Ingredientes, lo que se puede quitar y alérgenos: dentro de `DISHES` y `SIDE_INFO` en `index.html`.
