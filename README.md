# TP Nro 2 - Tecnología y Gestión Web (UTN FRLP)
### 👥 Grupo Canepa

Un desarrollo moderno utilizando **SvelteKit** para el frontend y backend intermedio (API routes), integrado con **Strapi CMS** y consumiendo datos en tiempo real de **The Movie Database (TMDB)**.

---

## 🛠️ Stack Tecnológico

| Componente | Tecnologías Utilizadas |
|---|---|
| **Frontend** | ![Svelte](https://img.shields.io/badge/Svelte-FF3E00?style=flat-square&logo=svelte&logoColor=white) 5 (Runes) + **Chart.js** |
| **Backend Intermedio** | SvelteKit API Routes (`/api/generar`, `/api/peliculas`) |
| **CMS / Persistencia** | ![Strapi](https://img.shields.io/badge/Strapi-2F2E6F?style=flat-square&logo=strapi&logoColor=white) (Instancia compartida cátedra, Content-Type: `canepa-pelicula`) |
| **API Externa** | ![TMDB](https://img.shields.io/badge/TMDB-01B4E4?style=flat-square&logo=the-movie-database&logoColor=white) (Películas en cartelera: `now_playing`) |

---

## 🚀 Qué hace la Aplicación

La aplicación realiza el siguiente flujo de datos:
1. **Consumo y Sincronización:** Obtiene las películas en cartelera actualizadas desde la API de TMDB.
2. **Persistencia (Upsert):** Sincroniza estos datos en Strapi (actualizando registros existentes por su `tmdb_id` único o insertando nuevos).
3. **Filtro y Segmentación:** En el frontend, se filtran las películas por una de 3 ciudades bonaerenses simuladas. La pertenencia a cada ciudad se calcula dinámicamente:
   - **Buenos Aires:** Muestra todas las películas.
   - **La Plata:** Películas con `tmdb_id` par (`tmdb_id % 2 == 0`).
   - **9 de Julio:** Películas con `tmdb_id` múltiplo de 5 (`tmdb_id % 5 == 0`).
   
   > [!NOTE]
   > Los IDs múltiples de 10 (por ejemplo, pares y múltiplos de 5) se mostrarán en ambas ciudades a la vez. Esto es un comportamiento esperado según las reglas matemáticas de la simulación.

---

## ⚙️ Cómo Correr el Proyecto

Sigue estos pasos para configurar y ejecutar la aplicación en tu entorno local:

### 1. Clonar e Instalar Dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
Copia el archivo de ejemplo y completa los valores requeridos:
```bash
cp .env.example .env
```

Edita el archivo `.env` configurando tus credenciales:
```env
# TMDB API Token (Obtenelo de https://www.themoviedb.org/settings/api)
TMDB_API_TOKEN=<token_provisto_por_catedra>

# Modo de almacenamiento (json = simulación local, strapi = conexión real con Strapi)
STORAGE_MODE=strapi

# URL y Endpoint de Strapi
STRAPI_API_URL=https://gestionweb.frlp.utn.edu.ar
STRAPI_ENDPOINT=canepa-peliculas

# Token de API con permisos necesarios
STRAPI_API_TOKEN=<tu_token_de_strapi>
```

### 3. Levantar Servidor de Desarrollo
```bash
npm run dev
```

Una vez iniciado:
1. Abre [http://localhost:5173](http://localhost:5173) en tu navegador.
2. Selecciona la ciudad y la cantidad de películas a mostrar (20, 40 o 60).
3. Haz clic en **"Cargar datos de APIs"** para iniciar la sincronización y renderizado.

Para compilar para producción:
```bash
npm run build
```

---

## 🗄️ Configuración en Strapi (Content-Type)

El Content-Type `canepa-pelicula` ya está configurado en la instancia de Strapi. A continuación se detallan sus campos:

| Campo | Tipo | Notas / Restricciones |
|---|---|---|
| `title` | Text | Título de la película |
| `overview` | Text largo | Sinopsis / Descripción |
| `poster_path` | Text | Ruta del poster en TMDB |
| `vote_average` | Number (Decimal) | Calificación promedio |
| `release_date` | Date | Fecha de lanzamiento |
| `tmdb_id` | Number (Integer) | **Unique field** (clave única para el Upsert) |

> [!IMPORTANT]
> - **Sin campo de ciudad:** La ciudad no se almacena en la base de datos de Strapi; se calcula dinámicamente en el frontend en base al `tmdb_id`.
> - **Permisos requeridos:** El token de la API de Strapi debe tener habilitados los permisos `find`, `create` y `update` sobre el Content-Type `canepa-pelicula`. No se requiere permiso de `delete` ya que la sincronización se realiza mediante una estrategia Upsert.

---

## 📂 Estructura del Código

Los componentes principales del proyecto están organizados de la siguiente manera:

* 🧩 [src/lib/ciudades.js](file:///home/ips-notebook-43292/utn/tygweb2026/src/lib/ciudades.js) - Contiene la lógica matemática para determinar a qué ciudad pertenece cada película.
* 💾 [src/lib/server/strapiStorage.js](file:///home/ips-notebook-43292/utn/tygweb2026/src/lib/server/strapiStorage.js) - Abstracción para interactuar con Strapi y realizar la sincronización mediante `sincronizarPeliculas`.
* 🔌 [src/routes/api/generar/+server.js](file:///home/ips-notebook-43292/utn/tygweb2026/src/routes/api/generar/+server.js) - Endpoint del backend que consulta las páginas de TMDB, realiza la deduplicación y ejecuta la sincronización en Strapi.
* 📊 [src/routes/api/peliculas/+server.js](file:///home/ips-notebook-43292/utn/tygweb2026/src/routes/api/peliculas/+server.js) - Endpoint que expone la lista de películas almacenadas en Strapi para que el frontend las consuma.
* 💻 [src/routes/+page.svelte](file:///home/ips-notebook-43292/utn/tygweb2026/src/routes/+page.svelte) - Interfaz principal del usuario. Contiene el selector de ciudad/cantidad, el gráfico estadístico (Chart.js), el motor de búsqueda y las tarjetas de películas.

---

## 📋 Checklist de Tareas del Grupo

- [ ] Investigación del sitio TMDB — *Asignado a:* `__________`
- [ ] Creación de cuenta y autenticación en TMDB — *Asignado a:* `__________`
- [ ] Relevamiento de APIs (TMDB `now_playing` + Strapi `/api/canepa-peliculas`) — *Asignado a:* `__________`
- [ ] Bosquejo y diseño del frontend — *Asignado a:* `__________`