# Órdenes TECR y pago con Tilopay — guía de activación

El sitio ya está listo para generar órdenes con número consecutivo (**TECR-750, TECR-751, …**),
recalcular el precio con su tarifario, anotarlas en una hoja de cálculo, cobrar con tarjeta en la
página segura de **Tilopay** y mandar el comprobante en PDF por correo al cliente y a usted.
Todo corre gratis dentro de su cuenta de Gmail (tropicalexpertscr@gmail.com). Solo hay que
activarlo una vez. Los pasos 1 a 5 (órdenes) toman unos 10 minutos; el paso 6 (Tilopay) se hace
cuando tenga las claves de su cuenta de Tilopay.

Archivos de esta carpeta:
- **`Codigo.gs`** — el programa.
- **`Tarifas.gs`** — copia de su tarifario (la genera la página; no se edita a mano).
- **`Logo.gs`** — el logo para el PDF (tampoco se edita).

## Paso 1 — Crear la hoja de cálculo
1. Entre a **sheets.google.com** con la cuenta tropicalexpertscr@gmail.com.
2. Cree una hoja en blanco y póngale de nombre **Tropical Experts — Órdenes**.

## Paso 2 — Pegar el código (3 archivos)
1. En esa hoja, menú **Extensiones → Apps Script**. Se abre el editor con un archivo `Código.gs`.
2. Borre todo lo que trae y pegue el contenido completo de **`Codigo.gs`**. Guarde (Ctrl+S).
3. A la izquierda, en **Archivos**, pulse **+ → Secuencia de comandos**, póngale de nombre `Tarifas`
   y pegue el contenido de **`Tarifas.gs`**. Guarde.
4. Repita con **+ → Secuencia de comandos**, nombre `Logo`, y pegue **`Logo.gs`**. Guarde.
5. Arriba a la izquierda, cámbiele el nombre al proyecto: **Órdenes TECR**.

## Paso 3 — Autorizar y probar
1. En la barra de arriba del editor, donde dice `doGet`, escoja la función **`probar`** y pulse **Ejecutar**.
2. Google le pedirá permisos. Pulse **Revisar permisos** → escoja su cuenta → si aparece
   "Google no ha verificado esta aplicación", pulse **Configuración avanzada → Ir a Órdenes TECR (no seguro)** → **Permitir**.
   (Es normal: la "aplicación" es su propio script, nadie más tiene acceso.)
3. Revise su Gmail: le llegaron **dos correos de prueba** — la orden pendiente de pago (con botón de pago de ejemplo)
   y el comprobante ya pagado — cada uno con su PDF. En la hoja apareció la pestaña **Órdenes**.
   Esa prueba **no** gasta ningún número ni toca Tilopay.

## Paso 4 — Publicar el servicio
1. Botón azul **Implementar → Nueva implementación**.
2. En el engranaje escoja **Aplicación web** y llene:
   - Descripción: `Órdenes TECR`
   - Ejecutar como: **Yo** (tropicalexpertscr@gmail.com)
   - Quién tiene acceso: **Cualquier persona**
3. Pulse **Implementar** y copie la **URL de la aplicación web** (termina en `/exec`).
   Si la abre en el navegador debe mostrar algo como `{"ok":true,"servicio":"ordenes Tropical Experts Costa Rica","ultimo":749,"tilopay":false}`.

## Paso 5 — Conectar la página
1. Abra `index.html` y busque `ordenes:{` (está en el bloque `CFG`, cerca de `vipExtra`).
2. Pegue la URL entre las comillas de `endpoint:""` → `endpoint:"https://script.google.com/macros/s/…/exec"`.
3. Haga lo mismo en `gracias.html`: al final del archivo, `const ENDPOINT = ""` → pegue la misma URL.
   (Si vuelve a generar el sitio con `build.py`, `gracias.html` toma la URL sola.)
4. Suba los archivos a GitHub como siempre. Desde ese momento cada reserva del sitio crea su orden.

## Paso 6 — Activar el cobro con tarjeta (Tilopay)
Necesita una cuenta de comercio en **tilopay.com** (la misma que usan Travesía y Private Travel).
Cuando la tenga:
1. Entre a **admin.tilopay.com → Tilopay Checkout** y copie tres datos: **usuario del API**, **contraseña del API** y **key** de integración.
2. En el editor de Apps Script abra `Codigo.gs`, busque la función **`guardarClavesTilopay`** y pegue los tres datos entre las comillas.
3. Arriba escoja la función **`guardarClavesTilopay`** y pulse **Ejecutar**. Al terminar, **borre los tres datos del código**
   (deje las comillas vacías) y guarde. Las claves quedaron guardadas en las propiedades del proyecto, fuera del código,
   así nunca se suben a GitHub.
4. En `CONFIG` ponga `TILOPAY: { ACTIVO: true, …`. **Revise `URL_GRACIAS`**: es la página a la que Tilopay devuelve al
   cliente y tiene que ser la dirección REAL donde esté publicado este sitio nuevo el día que active el cobro.
   Viene puesta como `https://www.tropicalexpertscostarica.com/gracias`; si todavía no ha movido el dominio al sitio nuevo,
   cámbiela por `https://tropicalexperts.vercel.app/gracias` mientras tanto. Si esa dirección no existe, el cliente paga
   pero cae en una página de error (el pago igual se detecta con el activador de la última sección).
5. Ejecute la función **`probarTilopay`**: si dice "Conexión con Tilopay correcta" está listo.
6. **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar.**
7. En `index.html`, dentro de `CFG.pagos`, cambie `tarjeta:false` por **`tarjeta:true`** y suba el archivo.
   El botón de la reserva pasa a decir **"Reservar y pagar con tarjeta"** y aparecen los campos *País* y
   *Código postal de la tarjeta* (Tilopay los usa para verificar la tarjeta y proteger el cobro).
8. Haga una reserva de prueba real desde la página con la cuenta de Tilopay en **modo de pruebas**
   (se cambia en el portal de Tilopay; la API es la misma). Pague con la tarjeta de pruebas que le dé Tilopay,
   vuelva a la página de gracias y revise que le llegó el comprobante y que la fila quedó **"Pagada · Tilopay"**.
9. Ponga la cuenta de Tilopay en **producción** y listo.

**Opcional, recomendado:** en el editor, menú **Activadores (reloj) → Añadir activador** → función `revisarPagosPendientes`,
tipo *Según tiempo*, *Cada hora*. Así, si un cliente paga pero cierra el navegador antes de volver a la página de gracias,
el sistema igual detecta el pago y manda el comprobante.

## Los datos de la empresa en el comprobante
El comprobante en PDF y la página de términos salen con el logo, el nombre de la empresa y sus datos legales, tomados de
`Codigo.gs` → `CONFIG` y de `paginas.py` → `EMPRESA`:

- **Carlos Johnnson Paniagua Berrocal** · Cédula **4-0188-0497**
- WhatsApp +506 8486 7057 · Teléfono +506 8762 4779 · tropicalexpertscr@gmail.com
- La Fortuna, San Carlos, Alajuela, Costa Rica · Licencia I.C.T. #3946-2025 · tropicalexpertscostarica.com

Si algo de esto cambia, corríjalo en esos dos lugares (y en `CFG` de `index.html` para los teléfonos de la página).

## La clave de seguridad (ya viene puesta, no hay que hacer nada)
La página y el script comparten una clave para que nadie de afuera pueda mandar órdenes falsas,
llenarle la hoja o gastarle el cupo de correos de Gmail. Viene puesta en los dos lados:

- en `index.html` → `CFG.ordenes.clave` (y en `gracias.html` → `CLAVE`)
- en `Codigo.gs` → `CONFIG.CLAVE`

Si algún día quiere cambiarla, cámbiela **en los tres archivos con el mismo texto** y vuelva a
implementar el script. El script además rechaza más de 12 solicitudes en 10 minutos, que es muchísimo
más de lo que una persona haría y suficiente para frenar a un robot.

## Qué más protege el sistema (ya viene puesto)
- **El precio lo decide su tarifario, no el navegador del cliente.** El script recalcula cada tramo con
  `Tarifas.gs` (mismas tarifas de la página: vehículo + VIP + horas extra). Si alguien manipula el monto
  desde su navegador, la orden se crea igual pero con el precio correcto, y su correo avisa que se corrigió.
  Ese es el monto que se le cobra en Tilopay.
- **El pago se confirma con Tilopay, no con lo que diga la URL.** Cuando el cliente vuelve a la página de
  gracias, el script pregunta directamente a Tilopay por esa orden; solo si Tilopay responde "aprobada" la
  marca **Pagada** y envía el comprobante. Nadie puede "fabricar" una confirmación.
- **Todo lo que escribe el cliente se limpia antes de usarse**: largos máximos, sin caracteres raros,
  montos y cantidades como números con tope, máximo 12 tramos por orden. En los correos y el PDF todo va
  "escapado": aunque alguien escriba código en el nombre o en las notas, se ve como texto inofensivo.
- **En la página web no queda nada del cliente.** El sitio es estático: no tiene base de datos. Los datos
  del viaje viven en el navegador del cliente solo mientras arma la reserva, y se borran en cuanto la
  envía (antes de pasar a Tilopay). El único registro es su hoja de cálculo y su Gmail — privados y
  protegidos por su cuenta de Google. Cuide esa cuenta con verificación en dos pasos.
- **Los datos de tarjeta nunca pasan por la página ni por el script.** El cliente los escribe únicamente en
  la página segura de Tilopay (certificada PCI DSS, con verificación 3-D Secure). Tilopay procesa, protege
  y responde por la transacción; en su estado de cuenta el cliente ve el cargo a nombre de la empresa.
- **Términos aceptados.** El cliente debe marcar "Leí y acepto los Términos y Condiciones" (página
  `terminos.html`, con la política de cancelación de 48 h y la de privacidad). La hoja anota que los aceptó:
  eso es lo que Tilopay y el banco piden si algún día un cliente disputa un cargo.

---

## Cómo funciona una reserva (con Tilopay activo)
1. El cliente arma su viaje (uno, o varios desde el carrito), escoge Estándar o **Tropical Experts VIP**,
   llena fecha, hora, direcciones y vuelo de cada tramo, sus datos, país y código postal de la tarjeta, y acepta los términos.
2. Al pulsar **"Reservar y pagar con tarjeta"** la página crea la orden (**TECR-###**), le manda al cliente el correo
   "Su orden — pendiente de pago" con el PDF y un botón de pago, borra todo del navegador y lo lleva a la página segura de Tilopay.
3. El cliente paga. Tilopay lo devuelve a **gracias.html**, que le pide al script confirmar el pago.
4. El script verifica con Tilopay, pasa la fila a **"Pagada · Tilopay"** (con autorización y número de transacción) y manda
   el **comprobante de reserva** en PDF al cliente y el aviso **"PAGADA TECR-###"** a usted.
5. Un día antes del viaje, usted le manda al cliente conductor, placa y punto de encuentro.

Si el pago se rechaza, la página de gracias se lo dice al cliente, le deja **intentar de nuevo** con un enlace nuevo
o escribirle por WhatsApp; en la hoja queda "Pago rechazado · Tilopay". Si Tilopay no está activo, todo funciona como antes:
orden + correo + WhatsApp, y usted manda el enlace de pago a mano.

## Preguntas frecuentes
- **¿Y si el servicio no responde?** La página sigue funcionando: abre WhatsApp con la solicitud completa y avisa
  al cliente que el número TECR le llegará por correo. Usted lo crea a mano en la hoja.
- **¿Cuántas órdenes por día?** Gmail gratuito permite 100 correos al día desde scripts; una orden pagada usa 4
  (2 al crearse, 2 al pagarse) → unas 25 órdenes pagadas al día. Si algún día se queda corto, Google Workspace sube el cupo a 1 500.
- **¿Cambié el código?** Después de editar `Codigo.gs`: **Implementar → Administrar implementaciones → lápiz →
  Versión: Nueva versión → Implementar**. La URL se mantiene igual.
- **¿Cambié tarifas en la página?** Vuelva a generar el sitio (`build.py`) y pegue el nuevo `Tarifas.gs` en el proyecto
  (reemplazando el anterior); luego nueva versión.
- **¿Quiero empezar de nuevo en TECR-750?** En el editor ejecute la función `reiniciarConsecutivo`.
- **¿Dónde cambio el texto del PDF o del correo?** En `Codigo.gs`, funciones `documentoHtml_` y `correoClienteHtml_`.
- **¿Cómo devuelvo un pago?** Desde el portal de Tilopay (admin.tilopay.com), buscando la orden por su número TECR.
- **¿Puedo ver el último número usado?** Abra la URL `/exec` en el navegador: `"ultimo": 7xx`.
