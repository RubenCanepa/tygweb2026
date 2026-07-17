import { STRAPI_API_URL, STRAPI_API_TOKEN, STRAPI_ENDPOINT } from '$env/static/private';

/**
 * =========================================================================
 * ⚠️ WARNING / TODO:
 * IMPLEMENTACIÓN PENDIENTE DE VALIDAR CONTRA LA INSTANCIA REAL DE STRAPI 
 * DE LA CÁTEDRA.
 * ASEGURARSE DE CAMBIAR LA VARIABLE DE ENTORNO STORAGE_MODE=strapi EN EL 
 * ARCHIVO .env ANTES DE LA ENTREGA FINAL.
 * 
 * NOTA DE BULK DELETE: Dado que Strapi no cuenta con una operación nativa
 * de "borrado masivo" en un solo llamado HTTP, primero solicitamos todos los
 * IDs de las películas persistidas y realizamos peticiones DELETE individuales.
 * Luego, insertamos la nueva tanda con peticiones POST.
 * =========================================================================
 */

const strapiBaseUrl = STRAPI_API_URL || 'http://localhost:1337';
const strapiEndpoint = STRAPI_ENDPOINT || 'canepa-peliculas';
const apiPath = `${strapiBaseUrl}/api/${strapiEndpoint}`;

const TIMEOUT_MS = 8000; // 8 segundos por request individual, ajustable

/**
 * Custom fetch helper that aborts after a timeout
 */
async function fetchConTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(url, { ...options, signal: controller.signal });
		clearTimeout(timeoutId);
		return res;
	} catch (err) {
		clearTimeout(timeoutId);
		if (err.name === 'AbortError') {
			throw new Error(`Timeout de ${timeoutMs}ms superado en: ${url}`);
		}
		throw err;
	}
}

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
		const queryUrl = `${apiPath}?pagination[limit]=100`;
		
		console.log(`[strapiStorage] Obteniendo listado completo desde: ${queryUrl}`);
		
		const res = await fetchConTimeout(queryUrl, {
			method: 'GET',
			headers: getHeaders()
		});

		if (!res.ok) {
			throw new Error(`Error en Strapi GET: ${res.status} ${res.statusText}`);
		}

		return await res.json();
	},

	/**
	 * Deletes all existing records and uploads the new batch (Deprecated)
	 * @param {Array<object>} peliculas - New movies collection
	 * @returns {Promise<{ data: Array }>}
	 */
	async reemplazarPeliculas(peliculas) {
		const headers = getHeaders();
		const inicioTotal = Date.now();

		// --- FASE 1: Borrado ---
		console.log(`[strapiStorage] === INICIO reemplazarPeliculas (${peliculas.length} nuevas) ===`);
		const inicioBorrado = Date.now();
		let totalBorradas = 0;

		while (true) {
			const currentRes = await fetchConTimeout(
				`${apiPath}?pagination[pageSize]=100&pagination[page]=1`,
				{ method: 'GET', headers },
				TIMEOUT_MS
			);

			if (!currentRes.ok) {
				throw new Error(`Error al recuperar lista previa de Strapi: ${currentRes.status}`);
			}

			const currentData = await currentRes.json();
			const oldRecords = currentData.data || [];
			if (oldRecords.length === 0) break;

			console.log(`[strapiStorage] Lote de ${oldRecords.length} registros a borrar...`);

			for (let i = 0; i < oldRecords.length; i++) {
				const record = oldRecords[i];
				const t0 = Date.now();
				try {
					const delRes = await fetchConTimeout(
						`${apiPath}/${record.id}`,
						{ method: 'DELETE', headers },
						TIMEOUT_MS
					);
					const ms = Date.now() - t0;
					if (!delRes.ok) {
						console.warn(`[strapiStorage] DELETE id=${record.id} FALLÓ (${delRes.status}) en ${ms}ms`);
					} else {
						totalBorradas++;
						if ((i + 1) % 5 === 0 || i === oldRecords.length - 1) {
							console.log(`[strapiStorage] Borrado ${i + 1}/${oldRecords.length} (id=${record.id}, ${ms}ms)`);
						}
					}
				} catch (err) {
					console.error(`[strapiStorage] DELETE id=${record.id} ERROR tras ${Date.now() - t0}ms:`, err.message);
				}
			}
		}
		console.log(`[strapiStorage] FASE 1 completa: ${totalBorradas} borradas en ${Date.now() - inicioBorrado}ms`);

		// --- FASE 2: Inserción ---
		const inicioInsercion = Date.now();
		console.log(`[strapiStorage] Subiendo ${peliculas.length} películas nuevas...`);
		const uploadedList = [];

		for (let i = 0; i < peliculas.length; i++) {
			const movie = peliculas[i];
			const t0 = Date.now();
			const payload = {
				title: movie.title,
				overview: movie.overview || '',
				poster_path: movie.poster_path,
				vote_average: Number(movie.vote_average) || 0,
				release_date: movie.release_date || null,
				tmdb_id: Number(movie.tmdb_id)
			};

			try {
				const createRes = await fetchConTimeout(
					apiPath,
					{ method: 'POST', headers, body: JSON.stringify({ data: payload }) },
					TIMEOUT_MS
				);
				const ms = Date.now() - t0;

				if (!createRes.ok) {
					throw new Error(`Código ${createRes.status}`);
				}

				const resObj = await createRes.json();
				if (resObj.data) uploadedList.push(resObj.data);

				if ((i + 1) % 5 === 0 || i === peliculas.length - 1) {
					console.log(`[strapiStorage] Insertada ${i + 1}/${peliculas.length}: "${movie.title}" (${ms}ms)`);
				}
			} catch (err) {
				console.error(`[strapiStorage] POST "${movie.title}" ERROR tras ${Date.now() - t0}ms:`, err.message);
			}
		}

		console.log(`[strapiStorage] FASE 2 completa: ${uploadedList.length}/${peliculas.length} subidas en ${Date.now() - inicioInsercion}ms`);
		console.log(`[strapiStorage] === FIN reemplazarPeliculas: ${Date.now() - inicioTotal}ms totales ===`);

		return { data: uploadedList };
	},

	/**
	 * Upsert: actualiza las películas existentes (match por tmdb_id) e inserta
	 * las nuevas. No borra nada.
	 * @param {Array<object>} peliculas
	 * @returns {Promise<{ data: Array, stats: object }>}
	 */
	async sincronizarPeliculas(peliculas) {
		const headers = getHeaders();
		const inicioTotal = Date.now();

		console.log(`[strapiStorage] === INICIO sincronizarPeliculas (${peliculas.length} películas) ===`);

		// 1. Traer TODO lo existente (paginando si hace falta, no asumir tope)
		const existentes = [];
		let page = 1;
		while (true) {
			const res = await fetchConTimeout(
				`${apiPath}?pagination[pageSize]=100&pagination[page]=${page}`,
				{ method: 'GET', headers },
				TIMEOUT_MS
			);
			if (!res.ok) throw new Error(`Error al listar existentes: ${res.status}`);
			const data = await res.json();
			const items = data.data || [];
			existentes.push(...items);
			const totalPages = data.meta?.pagination?.pageCount || 1;
			if (page >= totalPages || items.length === 0) break;
			page++;
		}

		// 2. Mapa tmdb_id -> id de Strapi, para saber si es update o insert
		const mapaExistente = new Map();
		for (const item of existentes) {
			const attrs = item.attributes || item; // soporta v4 (con attributes) y v5 (plano)
			if (attrs.tmdb_id != null) {
				mapaExistente.set(Number(attrs.tmdb_id), item.id);
			}
		}
		console.log(`[strapiStorage] ${mapaExistente.size} películas existentes detectadas para posible update.`);

		// 3. Recorrer el lote nuevo: PUT si existe, POST si no
		let actualizadas = 0;
		let creadas = 0;
		let fallidas = 0;
		const resultado = [];

		for (let i = 0; i < peliculas.length; i++) {
			const movie = peliculas[i];
			const t0 = Date.now();
			const payload = {
				title: movie.title,
				overview: movie.overview || '',
				poster_path: movie.poster_path,
				vote_average: Number(movie.vote_average) || 0,
				release_date: movie.release_date || null,
				tmdb_id: Number(movie.tmdb_id)
			};

			const strapiId = mapaExistente.get(Number(movie.tmdb_id));

			try {
				let res;
				if (strapiId) {
					// UPDATE
					res = await fetchConTimeout(
						`${apiPath}/${strapiId}`,
						{ method: 'PUT', headers, body: JSON.stringify({ data: payload }) },
						TIMEOUT_MS
					);
				} else {
					// INSERT
					res = await fetchConTimeout(
						apiPath,
						{ method: 'POST', headers, body: JSON.stringify({ data: payload }) },
						TIMEOUT_MS
					);
				}

				if (!res.ok) throw new Error(`Código ${res.status}`);

				const resObj = await res.json();
				if (resObj.data) resultado.push(resObj.data);

				if (strapiId) actualizadas++; else creadas++;

				if ((i + 1) % 5 === 0 || i === peliculas.length - 1) {
					console.log(
						`[strapiStorage] ${i + 1}/${peliculas.length} — "${movie.title}" ` +
						`(${strapiId ? 'UPDATE' : 'INSERT'}, ${Date.now() - t0}ms)`
					);
				}
			} catch (err) {
				fallidas++;
				console.error(`[strapiStorage] Falló "${movie.title}" (tmdb_id=${movie.tmdb_id}):`, err.message);
				// seguimos con el resto, un fallo puntual no frena todo el lote
			}
		}

		console.log(
			`[strapiStorage] === FIN sincronizarPeliculas: ${actualizadas} actualizadas, ${creadas} creadas, ` +
			`${fallidas} fallidas, en ${Date.now() - inicioTotal}ms ===`
		);

		return { data: resultado, stats: { actualizadas, creadas, fallidas } };
	}
};
