import { STRAPI_API_URL, STRAPI_API_TOKEN, STRAPI_ENDPOINT } from '$env/static/private';

const strapiBaseUrl = STRAPI_API_URL || 'http://localhost:1337';
const strapiEndpoint = STRAPI_ENDPOINT || 'canepa-peliculas';
const apiPath = `${strapiBaseUrl}/api/${strapiEndpoint}`;
const TIMEOUT_MS = 8000;

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

export const strapiStorage = {
	/**
	 * Trae el catálogo completo desde Strapi, paginando si hace falta.
	 */
	async obtenerPeliculas() {
		const todas = [];
		let page = 1;
		console.log('[strapiStorage] Obteniendo catálogo completo...');

		while (true) {
			const res = await fetchConTimeout(
				`${apiPath}?pagination[pageSize]=100&pagination[page]=${page}`,
				{ method: 'GET', headers: getHeaders() },
				TIMEOUT_MS
			);
			if (!res.ok) throw new Error(`Error en Strapi GET: ${res.status} ${res.statusText}`);

			const data = await res.json();
			const items = data.data || [];
			todas.push(...items);

			const totalPages = data.meta?.pagination?.pageCount || 1;
			if (page >= totalPages || items.length === 0) break;
			page++;
		}

		console.log(`[strapiStorage] ${todas.length} películas recuperadas.`);
		return { data: todas };
	},

	/**
	 * Inserta solo las películas cuyo tmdb_id todavía no existe en Strapi.
	 * No borra, no actualiza. Las que ya existen se descartan silenciosamente
	 * (quedan tal cual estaban).
	 */
	async sincronizarPeliculas(peliculas) {
		const headers = getHeaders();
		const inicioTotal = Date.now();
		console.log(`[strapiStorage] === INICIO sincronizarPeliculas (${peliculas.length} candidatas) ===`);

		// 1. Traer existentes y armar el set de tmdb_id ya presentes
		const { data: existentes } = await this.obtenerPeliculas();
		const idsExistentes = new Set(
			existentes
				.map((item) => {
					const attrs = item.attributes || item; // soporta v4 (attributes) y v5 (plano)
					return attrs.tmdb_id != null ? Number(attrs.tmdb_id) : null;
				})
				.filter((id) => id != null)
		);
		console.log(`[strapiStorage] ${idsExistentes.size} tmdb_id ya presentes en Strapi.`);

		// 2. Insertar solo las que no están
		let creadas = 0;
		let omitidas = 0;
		let fallidas = 0;
		const resultado = [];

		for (let i = 0; i < peliculas.length; i++) {
			const movie = peliculas[i];
			const tmdbId = Number(movie.tmdb_id);

			if (idsExistentes.has(tmdbId)) {
				omitidas++;
				continue; // ya existe, no se toca
			}

			const t0 = Date.now();
			const payload = {
				title: movie.title,
				overview: movie.overview || '',
				poster_path: movie.poster_path,
				vote_average: Number(movie.vote_average) || 0,
				release_date: movie.release_date || null,
				tmdb_id: tmdbId
			};

			try {
				const res = await fetchConTimeout(
					apiPath,
					{ method: 'POST', headers, body: JSON.stringify({ data: payload }) },
					TIMEOUT_MS
				);
				if (!res.ok) throw new Error(`Código ${res.status}`);

				const resObj = await res.json();
				if (resObj.data) resultado.push(resObj.data);
				creadas++;

				if (creadas % 5 === 0) {
					console.log(`[strapiStorage] Insertada "${movie.title}" (${Date.now() - t0}ms) — ${creadas} nuevas hasta ahora`);
				}
			} catch (err) {
				fallidas++;
				console.error(`[strapiStorage] Falló "${movie.title}" (tmdb_id=${tmdbId}):`, err.message);
			}
		}

		console.log(
			`[strapiStorage] === FIN sincronizarPeliculas: ${creadas} creadas, ${omitidas} omitidas (ya existían), ` +
			`${fallidas} fallidas, en ${Date.now() - inicioTotal}ms ===`
		);

		return { data: resultado, stats: { creadas, omitidas, fallidas } };
	}
};
