import { STRAPI_API_URL, STRAPI_API_TOKEN } from '$env/static/private';

/**
 * =========================================================================
 * ⚠️ WARNING / TODO:
 * IMPLEMENTACIÓN PENDIENTE DE VALIDAR CONTRA LA INSTANCIA REAL DE STRAPI 
 * DE LA CÁTEDRA.
 * ASEGURARSE DE CAMBIAR LA VARIABLE DE ENTORNO STORAGE_MODE=strapi EN EL 
 * ARCHIVO .env ANTES DE LA ENTREGA FINAL.
 * =========================================================================
 */

const strapiBaseUrl = STRAPI_API_URL || 'http://localhost:1337';

/**
 * Generates headers for API requests to Strapi
 */
function getHeaders() {
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};

	if (STRAPI_API_TOKEN) {
		headers['Authorization'] = `Bearer ${STRAPI_API_TOKEN}`;
	}

	return headers;
}

export const strapiStorage = {
	/**
	 * Fetches the entire collection of movies from Strapi (city-agnostic)
	 * @returns {Promise<{ data: Array }>}
	 */
	async obtenerPeliculas() {
		const queryUrl = `${strapiBaseUrl}/api/peliculas?pagination[limit]=100`;
		
		console.log(`[strapiStorage] Obteniendo listado completo de películas desde Strapi...`);
		
		const res = await fetch(queryUrl, {
			method: 'GET',
			headers: getHeaders()
		});

		if (!res.ok) {
			throw new Error(`Error en Strapi GET: ${res.status} ${res.statusText}`);
		}

		return await res.json();
	},

	/**
	 * Creates or updates (upsert) a movie record in Strapi based on unique tmdb_id (no city field)
	 * @param {object} movieData
	 * @returns {Promise<object>}
	 */
	async guardarPelicula(movieData) {
		const headers = getHeaders();
		const checkUrl = `${strapiBaseUrl}/api/peliculas?filters[tmdb_id][$eq]=${movieData.tmdb_id}`;
		
		console.log(`[strapiStorage] Verificando existencia de tmdb_id=${movieData.tmdb_id} en Strapi...`);
		
		const checkRes = await fetch(checkUrl, {
			method: 'GET',
			headers
		});

		if (!checkRes.ok) {
			throw new Error(`Error al verificar película en Strapi: ${checkRes.status}`);
		}

		const checkData = await checkRes.json();
		const existingRecords = checkData.data || [];

		let finalRes;

		if (existingRecords.length > 0) {
			// Update (PUT)
			const existingId = existingRecords[0].id;
			const updateUrl = `${strapiBaseUrl}/api/peliculas/${existingId}`;
			console.log(`[strapiStorage] Película "${movieData.title}" existe con ID Strapi ${existingId}. Actualizando...`);

			finalRes = await fetch(updateUrl, {
				method: 'PUT',
				headers,
				body: JSON.stringify({ data: movieData })
			});

			if (!finalRes.ok) {
				throw new Error(`Error al actualizar película en Strapi (ID: ${existingId}): ${finalRes.status}`);
			}
		} else {
			// Create (POST)
			const createUrl = `${strapiBaseUrl}/api/peliculas`;
			console.log(`[strapiStorage] Película "${movieData.title}" es nueva. Creando en Strapi...`);

			finalRes = await fetch(createUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({ data: movieData })
			});

			if (!finalRes.ok) {
				throw new Error(`Error al crear película en Strapi: ${finalRes.status}`);
			}
		}

		const result = await finalRes.json();
		return result.data;
	},

	/**
	 * Replaces the entire collection of movies in Strapi.
	 * First deletes all existing records by calling DELETE sequentially on their IDs,
	 * then creates (POST) each movie from the new set.
	 *
	 * ⚠️ WARNING: Esta operación debe ser probada y validada exhaustivamente contra la 
	 * instancia real de Strapi de la cátedra, ya que Strapi no dispone de un endpoint 
	 * nativo para "borrar todo" y dependemos de la iteración individual de IDs.
	 *
	 * @param {Array<object>} peliculas - Nuevas películas a guardar
	 * @returns {Promise<{ data: Array }>}
	 */
	async reemplazarPeliculas(peliculas) {
		const headers = getHeaders();
		
		console.log(`[strapiStorage] Iniciando reemplazo total de películas en Strapi...`);
		
		// 1. Obtener todas las películas actuales para conocer sus IDs de Strapi
		let actuales = [];
		try {
			const res = await this.obtenerPeliculas();
			actuales = res.data || [];
		} catch (err) {
			console.warn(`[strapiStorage] Advertencia al obtener películas previas para borrar: ${err.message}. Continuando...`);
		}

		// 2. Eliminar cada película actual de a una por su ID de Strapi
		console.log(`[strapiStorage] Eliminando ${actuales.length} películas existentes en Strapi...`);
		for (const item of actuales) {
			const deleteUrl = `${strapiBaseUrl}/api/peliculas/${item.id}`;
			try {
				const delRes = await fetch(deleteUrl, {
					method: 'DELETE',
					headers
				});
				if (!delRes.ok) {
					console.error(`[strapiStorage] Error al eliminar película con ID Strapi ${item.id}: ${delRes.status}`);
				}
			} catch (err) {
				console.error(`[strapiStorage] Excepción al eliminar película con ID Strapi ${item.id}:`, err);
			}
		}

		// 3. Crear las nuevas películas (POST)
		console.log(`[strapiStorage] Creando ${peliculas.length} películas en Strapi...`);
		const creadas = [];
		for (const movieData of peliculas) {
			const createUrl = `${strapiBaseUrl}/api/peliculas`;
			try {
				const res = await fetch(createUrl, {
					method: 'POST',
					headers,
					body: JSON.stringify({ data: movieData })
				});

				if (!res.ok) {
					throw new Error(`Error en Strapi POST al crear: ${res.status} ${res.statusText}`);
				}

				const result = await res.json();
				if (result.data) {
					creadas.push(result.data);
				}
			} catch (err) {
				console.error(`[strapiStorage] Error creando película "${movieData.title}" en Strapi:`, err);
				throw err;
			}
		}

		return { data: creadas };
	}
};
