# Tropical Experts Costa Rica

Sitio de traslados privados con blog de 16 artículos en español e inglés. Sin
dependencias externas, más dos funciones que mantienen al día las reseñas de
Google y el tipo de cambio.

## Lo que contiene este repositorio

    index.html        La página completa: diseño, textos, precios y programación
    blog/             17 archivos: los 16 artículos + el índice del blog
    img/              85 imágenes: fotos, logo y vehículos
    api/reviews.js    Función que consulta las reseñas de Google una vez al día
    api/rates.js      Función que consulta el tipo de cambio del día
    ordenes/          Sistema de órdenes TECR: Codigo.gs (Apps Script) + GUIA-ORDENES.md
    vercel.json       Configuración de Vercel
    .gitignore        Evita subir llaves por accidente

**Total: 110 archivos** (85 imágenes). Si en GitHub ve menos, falta algo — lo más común es que
falten las carpetas `blog` e `img`, y sin ellas el sitio se ve sin fotos y los
enlaces del blog dan error.

---

## ⚠️ Lo único que nunca se sube aquí

**La llave de Google no va en ningún archivo de este repositorio.** Va guardada en
Vercel, en Environment Variables. Si la escribe en un archivo y lo sube, queda
pública para siempre en el historial de Git — aunque después la borre — y Google
la desactiva por seguridad.

---

## Publicar por primera vez

### 1 · Crear el repositorio en GitHub

1. Entre a <https://github.com/new>
2. Nombre: `tropical-experts` · déjelo en **Private** si prefiere
3. **No** marque "Add a README" — ya viene uno aquí
4. Clic en **Create repository**

### 2 · Subir TODO el contenido

En la página del repositorio recién creado:

1. Clic en **uploading an existing file** (o **Add file → Upload files**)
2. Descomprima el ZIP en su computadora, abra la carpeta, seleccione **todo**
   (Ctrl+A o Cmd+A) y arrástrelo a GitHub — deben ir el `index.html`, y las
   carpetas completas `blog`, `img` y `api`, más `vercel.json`, `.gitignore` y
   este `README.md`
3. Espere a que termine de subir las 107 (puede tardar unos minutos por las fotos)
4. Abajo, en el cuadro de mensaje, escriba `Primera versión`
5. Clic en **Commit changes**

> **Si GitHub no le deja arrastrar carpetas:** suba primero los archivos sueltos,
> y después use **Add file → Upload files** una vez por cada carpeta, entrando a
> ella y arrastrando su contenido.

### 3 · Conectar con Vercel

1. Entre a <https://vercel.com> con su cuenta
2. **Add New… → Project**
3. Escoja el repositorio `tropical-experts` → **Import**
4. No cambie ninguna configuración → **Deploy**

En un minuto el sitio queda en línea en una dirección tipo
`tropical-experts.vercel.app`. De ahí en adelante, cada cambio que suba a GitHub
se publica solo.

---

## Después de publicar

### Activar el contador de reseñas de Google

1. En Vercel: **Settings → Environment Variables**
2. Nombre: `GOOGLE_MAPS_API_KEY` · Valor: su llave de Google Cloud
3. **Save** y luego **Deployments → ⋯ → Redeploy**

Sin la llave el sitio funciona igual; solo muestra el número fijo de reseñas.

### Conectar el pago con Tab

En `index.html`, busque `pagos:` y pegue el enlace de su cuenta de
business.tab.travel entre las comillas de `enlace`. Mientras esté vacío, el botón
de pago envía el carrito por WhatsApp, que también funciona.

### Cambiar precios o agregar rutas

Todo está en `index.html`, en el bloque `ROUTES`. Cada línea es una ruta con sus
tres precios: `p5` (Staria), `p9` (Hiace) y `p12` (Maxus). Edite, guarde, suba a
GitHub y Vercel republica solo.
