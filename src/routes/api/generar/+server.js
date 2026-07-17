import { json } from '@sveltejs/kit';
import { TMDB_API_TOKEN } from '$env/static/private';
import { storage, storageMode } from '$lib/server/storage.js';

const GLOBAL_TIMEOUT_MS = 90000;

function conTimeoutGlobal(promesa, ms) {
	return Promise.race([
		promesa,
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`El proceso de sincronización superó ${ms / 1000}s.`)), ms)
		)
	]);
}

/**
 * Handles POST requests to fetch a specific number of movies (20, 40, or 60)
 * from TMDB by navigating through its pages and replacing the entire active storage.
 */
export async function POST({ request }) {
	try {
		const { cantidad } = await request.json();
		const numCantidad = Number(cantidad) || 20;

		if (![20, 40, 60].includes(numCantidad)) {
			return json(
				{ error: 'La cantidad seleccionada debe ser 20, 40 o 60.' },
				{ status: 400 }
			);
		}

		if (!TMDB_API_TOKEN) {
			return json(
				{ error: 'El token TMDB_API_TOKEN no está configurado en el servidor.' },
				{ status: 500 }
			);
		}

		const paginasRequeridas = Math.ceil(numCantidad / 20);
		let allResults = [];

		console.log(`[generar] Solicitando cantidad: ${numCantidad} (${paginasRequeridas} páginas de TMDB)`);

		// 1. Fetch TMDB page-by-page to collect enough movies
		for (let page = 1; page <= paginasRequeridas; page++) {
			const tmdbUrl = `https://api.themoviedb.org/3/movie/now_playing?language=es-AR&page=${page}`;
			
			const tmdbResponse = await fetch(tmdbUrl, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${TMDB_API_TOKEN}`,
					Accept: 'application/json'
				}
			});

			if (!tmdbResponse.ok) {
				const errText = await tmdbResponse.text();
				console.error(`TMDB API Error en página ${page}:`, errText);
				return json(
					{ error: `Error de la API de TMDB en página ${page}: ${tmdbResponse.status} ${tmdbResponse.statusText}` },
					{ status: 502 }
				);
			}

			const tmdbData = await tmdbResponse.json();
			const results = tmdbData.results || [];
			allResults = allResults.concat(results);
		}

		// Deduplicate before slicing (TMDB can return duplicate movies on different pages)
		const vistos = new Set();
		const sinDuplicados = allResults.filter((peli) => {
			if (vistos.has(peli.id)) return false;
			vistos.add(peli.id);
			return true;
		});

		// 2. Slice to the exact count requested
		const slicedResults = sinDuplicados.slice(0, numCantidad);

		// 3. Map TMDB format to clean, storage-ready data (no city field)
		const mappedMovies = slicedResults.map(movie => {
			const posterUrl = movie.poster_path 
				? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
				: null;

			return {
				title: movie.title,
				overview: movie.overview || '',
				poster_path: posterUrl,
				vote_average: Number(movie.vote_average) || 0,
				release_date: movie.release_date || null,
				tmdb_id: movie.id
			};
		});

		// 4. Overwrite storage completely with the new batch (wrapped in global timeout)
		const resultEnvelope = await conTimeoutGlobal(
			storage.sincronizarPeliculas(mappedMovies), 
			GLOBAL_TIMEOUT_MS
		);
		const stats = resultEnvelope.stats || {};
		const countPersisted = (resultEnvelope.data || []).length;

		return json({
			success: true,
			message: `Sincronización finalizada (${storageMode.toUpperCase()}). ` +
				(stats.creadas != null
					? `${stats.creadas} nuevas agregadas, ${stats.omitidas} ya existían (sin tocar)${stats.fallidas ? `, ${stats.fallidas} fallidas` : ''}.`
					: `Se cargaron ${countPersisted} películas en el catálogo.`),
			count: countPersisted
		});

	} catch (error) {
		console.error('[generar] Error interno en endpoint:', error);
		return json(
			{ error: 'Error interno en el servidor.', details: error.message },
			{ status: 500 }
		);
	}
}

