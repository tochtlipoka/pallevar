# Automatización de pedidos de Pa'llevar

Cada pedido que se manda desde la web se guarda solo en una hoja de Google Sheets. Todos los días a las **8:05 pm (hora de Irlanda)** le llega un correo al jefe de cocina con todo lo de mañana:

- Platillo y número de comidas por turno.
- Guarniciones a preparar (mañana / tarde).
- Lo que hay que quitar ("sin cilantro", "sin queso en frijoles"…).
- Notas de los clientes.
- **Lista de compras** calculada con las recetas.
- **Ruta de entrega** por lugar, con el nombre de cada cliente y si ya pagó.

## Configuración (una sola vez, 10 minutos)

1. Crea una hoja nueva en Google Sheets llamada **Pa'llevar · Pedidos**.
2. En la hoja: **Extensiones → Apps Script**.
3. Borra lo que aparece y pega todo el contenido de `Code.gs`.
4. Arriba del código, en `CONFIG`, cambia:
   - `EMAIL_COCINA`: el correo del jefe de cocina.
   - `EMAIL_COPIA`: tu correo, si quieres copia.
5. En el ícono de engrane (**Configuración del proyecto**), pon la zona horaria en **(GMT+00:00) Dublin**.
6. Guarda (ícono de disco). Arriba, elige la función **setup** y dale **Ejecutar**. Google te pide permisos: acepta. Esto crea las hojas *Pedidos*, *Recetas* y *Resúmenes*, y programa el correo diario.
7. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**.
   - Dale **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
8. Pásale esa URL a Claude, o pégala en `index.html` en la línea `const ORDER_ENDPOINT='';`.

## Uso diario

- **Pagos:** cuando un cliente pague, cambia la columna *Pago* de "Pendiente" a **Pagado**. Si cancela, pon **Cancelado** y ya no cuenta para la producción.
- **Recetas:** el cocinero llena la hoja *Recetas* con los gramos reales por porción de cada platillo y guarnición. Los nombres tienen que ser iguales a los de la web (por ejemplo "Albóndigas en chipotle", "Frijoles").
- **Fuera de horario:** si alguien manda un pedido después de las 8 pm del día anterior, se guarda como *FUERA DE HORARIO* y no entra en la producción; el correo lo avisa.
- **Probar el correo:** en Apps Script, elige la función **enviarResumen** y dale **Ejecutar**.

## Privacidad

La hoja guarda nombre y WhatsApp de los clientes. Úsalos solo para gestionar pedidos, no compartas la hoja con nadie fuera del negocio y borra pedidos viejos cada cierto tiempo.
