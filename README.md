# Trabajo Práctico Nro 2 - Tecnología y Gestión Web (UTN FRLP)

Este proyecto es la solución completa para el Trabajo Práctico Nro 2 de la materia **Tecnología y Gestión Web** de la Universidad Tecnológica Nacional - Facultad Regional La Plata (UTN FRLP), ciclo lectivo 2026.

## Temática del Proyecto
El sistema obtiene películas en cartelera desde la API de TMDB (`now_playing`), almacena y actualiza el catálogo unificado en un Headless CMS (**Strapi**) sin almacenar la ciudad, y ofrece un panel de control con métricas, gráficos interactivos de **Chart.js** y listados del catálogo de películas filtrados reactivamente en el cliente.

---

### 🏙️ Simulación de Ciudades y Reglas de Negocio en Memoria

El catálogo se almacena de forma **agnóstica a la ciudad**: no hay un campo `ciudad` en la base de datos. La pertenencia de cada película a una ciudad se calcula de forma **dinámica en el frontend** usando la función pura `perteneceACiudad` definida en [`src/lib/ciudades.js`](src/lib/ciudades.js).

#### Ciudades disponibles

| Ciudad | Regla de filtrado | Ejemplo de `tmdb_id` incluido |
| :--- | :--- | :--- |
| **Buenos Aires** | Muestra **todas** las películas del catálogo | cualquier ID |
| **La Plata** | Solo películas con `tmdb_id` **par** (`tmdb_id % 2 === 0`) | 1084244, 1275780 |
| **9 de Julio** | Solo películas con `tmdb_id` **múltiplo de 5** (`tmdb_id % 5 === 0`) | 1084245, 1275780 |

> **Nota:** Los IDs que son múltiplos de **10** (par y múltiplo de 5 a la vez) aparecerán simultáneamente en **La Plata** y **9 de Julio**, emulando la superposición natural de carteleras entre ciudades cercanas.

El selector de ciudad en el sidebar aplica este filtro al instante, sin ninguna consulta adicional al servidor.

---

### 🎬 Carga del Catálogo desde TMDB (Multi-Página)

Al presionar el botón **"Cargar datos de APIs"**, el sistema sincroniza películas en cartelera desde el endpoint `now_playing` de TMDB. Podés controlar la **cantidad de películas a descargar** usando el selector que aparece encima del botón:

| Opción seleccionada | Páginas de TMDB consultadas | Películas máximas |
| :--- | :---: | :---: |
| 20 películas | 1 | 20 |
| 40 películas | 2 | 40 |
| 60 películas | 3 | 60 |

#### ¿Cómo funciona internamente?

La API Route [`/api/generar`](src/routes/api/generar/+server.js) recibe `{ cantidad: 20 | 40 | 60 }` en el cuerpo del `POST` y ejecuta los siguientes pasos:

1. **Calcula las páginas necesarias**: `Math.ceil(cantidad / 20)`, ya que TMDB devuelve 20 resultados por página.
2. **Obtiene la página 1** primero para conocer el `total_pages` real disponible en TMDB y evitar pedir páginas inexistentes.
3. **Itera secuencialmente** el resto de páginas hasta alcanzar el número requerido.
4. **Deduplica** por `tmdb_id` para evitar guardar la misma película dos veces.
5. **Recorta** la lista al tope exacto solicitado y persiste cada película a través del adaptador de storage activo.

El mensaje de respuesta al finalizar informa cuántas páginas se consultaron y cuántas películas se guardaron/actualizaron efectivamente.

---

## 🔌 Abstracción de Persistencia (Modo de Almacenamiento Intercambiable)
Para facilitar el desarrollo local sin necesidad de contar con acceso inmediato a una instancia activa de Strapi, el proyecto implementa un **adaptador de almacenamiento**. Podés elegir el origen/destino de los datos modificando la variable de entorno `STORAGE_MODE` en tu archivo `.env`:
*   `STORAGE_MODE=json`: (Modo desarrollo) Los datos se leen y escriben en un archivo local simétrico en `data/peliculas.json` que emula el mismo formato de Strapi.
*   `STORAGE_MODE=strapi`: (Modo producción) Los datos se sincronizan directamente con el servidor CMS de Strapi.

---

## 🚀 Instrucciones de Instalación y Ejecución

Sigue estos pasos para levantar el entorno de desarrollo localmente:

### 1. Clonar e Instalar Dependencias
Instalá las dependencias del proyecto ejecutando el siguiente comando en la raíz del proyecto:
```bash
npm install
```

### 2. Configurar Variables de Entorno (`.env`)
Copiá el archivo de ejemplo para crear tu archivo `.env` local:
```bash
cp .env.example .env
```

Abrí el archivo `.env` generado y configurá los siguientes parámetros:
*   `TMDB_API_TOKEN`: Tu token de lectura de la API de TMDB (Bearer Token).
*   `STORAGE_MODE`: Setealo en `json` para probar localmente de inmediato, o en `strapi` para conectarte al CMS.
*   `STRAPI_API_URL`: La URL base de tu servidor Strapi (por defecto `http://localhost:1337`).
*   `STRAPI_API_TOKEN`: *(Opcional)* Si decidiste no hacer públicos los permisos en Strapi, podés generar un API Token en el panel de Strapi y colocarlo acá.

### 3. Iniciar el Servidor de Desarrollo
Para correr la aplicación en modo desarrollo:
```bash
npm run dev
```
La aplicación estará disponible en [http://localhost:5173](http://localhost:5173). Si estás en modo `json`, al presionar **Cargar datos de APIs** se creará automáticamente la base de datos simulada en `data/peliculas.json`.

### 4. Compilar para Producción
Para validar y generar el paquete optimizado de producción:
```bash
npm run build
```

---

## ⚠️ CRÍTICO: REQUISITO PARA LA ENTREGA FINAL
> [!IMPORTANT]
> **Antes de realizar la entrega final del Trabajo Práctico:**
> 1. Modificá el archivo `.env` configurando la variable `STORAGE_MODE=strapi`.
> 2. Asegúrate de que el servidor de Strapi de la cátedra esté corriendo y accesible.
> 3. Hacé clic en **"Cargar datos de APIs"** en el frontend para validar que la integración real con Strapi funcione correctamente.
> 4. Recordá que la carpeta `data/` local está configurada en el `.gitignore` y **no** debe subirse al repositorio Git final.

---

## ⚙️ Configuración Requerida en Strapi (Headless CMS)

Dado que Strapi corre de forma externa, debés configurar el modelo de datos y los permisos manualmente en su panel administrador (`http://localhost:1337/admin`).

### 1. Creación del Content-Type `Pelicula`
Dirigite a **Content-Type Builder** y crea una nueva **Collection Type** con el nombre de pila **Pelicula** (ID de la API: `pelicula`, plural: `peliculas`).

Agregá exactamente los siguientes campos con sus respectivos tipos (nota que **no** se debe agregar ningún campo `ciudad`):

| Nombre del Campo | Tipo de Campo | Configuración Adicional | Descripción |
| :--- | :--- | :--- | :--- |
| `title` | **Text** (Single Line) | *Requerido* | Título original de la película |
| `overview` | **Text** (Long Text) | - | Sinopsis o descripción de la película |
| `poster_path` | **Text** (Single Line) | - | URL completa a la imagen del póster |
| `vote_average` | **Number** (Decimal) | - | Rating promedio de votación de TMDB |
| `release_date` | **Date** (date) | - | Fecha de estreno de la película |
| `tmdb_id` | **Number** (Integer) | *Único, Requerido* | ID único de TMDB (evita duplicados al sincronizar) |

*Nota: Asegúrate de guardar los cambios para que Strapi reinicie y cree las tablas correspondientes.*

### 2. Configuración de Permisos de la API
Para permitir que la aplicación SvelteKit consulte y guarde películas sin restricciones de autenticación complejas, debés configurar los accesos públicos:

1.  En el panel lateral de Strapi, ve a **Settings** (Ajustes).
2.  Bajo la sección **Users & Permissions Plugin**, hacé clic en **Roles**.
3.  Hacé clic en el rol **Public**.
4.  Buscá la sección **Pelicula** (o `Pelicula` dentro de la API principal) y marcá los siguientes permisos:
    *   `find` (Permite al frontend leer la cartelera completa)
    *   `findOne` (Opcional, lectura de registro individual)
    *   `create` (Permite a la API intermedia guardar películas)
    *   `update` (Permite a la API intermedia actualizar películas)
5.  Hacé clic en **Save** (Guardar) arriba a la derecha.

*Alternativa segura:* Si preferís no dejar estos endpoints públicos, podés crear un token de API en **Settings** -> **API Tokens** -> **Create new token** (tipo *Full Access* o *Custom* con permisos para Pelicula), y pegarlo en la variable `STRAPI_API_TOKEN` en tu archivo `.env`.

---

## 📝 Entregables y Checklist del Grupo

Completá la siguiente asignación de tareas dentro de tu equipo para documentar el trabajo de cara a la cátedra:

- [ ] **Investigación del sitio TMDB**
  *   **Descripción**: Análisis del catálogo de The Movie Database, estructura de endpoints y datos disponibles.
  *   **Asignado a**: __________________________________

- [ ] **Creación de cuenta y autenticación**
  *   **Descripción**: Proceso de registro en TMDB, solicitud de accesos de desarrollador y generación del Bearer Token.
  *   **Asignado a**: __________________________________

- [ ] **Relevamiento de APIs usadas**
  *   **Descripción**: Documentación técnica detallada de los endpoints consumidos: `now_playing` de TMDB y la colección `/api/peliculas` de Strapi (parámetros, métodos, respuestas).
  *   **Asignado a**: __________________________________

- [ ] **Bosquejo del frontend**
  *   **Descripción**: Diseño de interfaz de usuario de dos columnas, selección de paleta de colores y planeamiento del gráfico de barra interactivo de ratings.
  *   **Asignado a**: __________________________________

---

## 🛠️ Estructura del Código Fuente

*   `src/lib/ciudades.js`: Función pura `perteneceACiudad` y listado estático `CIUDADES`. Contiene la lógica de filtrado matemático (por paridad y divisibilidad del `tmdb_id`) para las 3 ciudades simuladas.
*   `src/lib/server/storage.js`: Selector central del storage engine activo (lee `STORAGE_MODE` del entorno).
*   `src/lib/server/jsonStorage.js`: Adaptador para lectura/escritura en archivo local `data/peliculas.json` estructurando los datos de salida con las mismas envolventes que tiene la API REST de Strapi (`{ data: [...] }`).
*   `src/lib/server/strapiStorage.js`: Adaptador para conexión por red con Strapi. *(Contiene advertencias de pruebas pendientes frente a la instancia oficial).*
*   `src/routes/api/generar/+server.js`: API Route intermedia en SvelteKit. Recibe `{ cantidad: 20 | 40 | 60 }`, calcula las páginas de TMDB necesarias, las itera secuencialmente, deduplica por `tmdb_id` y persiste mediante el adaptador activo.
*   `src/routes/api/peliculas/+server.js`: API Route proxy en SvelteKit. Consulta el listado completo de películas en la base de datos usando el adaptador activo y lo sirve al frontend.
*   `src/routes/+layout.svelte`: Esqueleto base de la aplicación. Importa el archivo global de estilos de diseño.
*   `src/routes/+page.svelte`: Controlador frontend de la aplicación. Gestiona el selector de ciudad, el selector de cantidad de películas a cargar, aplica el filtro matemático de pertenencia por `tmdb_id` en el cliente, calcula métricas y renderiza el gráfico reactivo de **Chart.js**.
*   `src/app.css`: Hoja de estilos en CSS nativo (Vanilla CSS) con estética dark mode y efectos glassmorphic.
