import { json } from '@sveltejs/kit';
import { TMDB_API_TOKEN } from '$env/static/private';
import { storage, storageMode } from '$lib/server/storage.js';

const TMDB_PAGE_SIZE = 20; // TMDB always returns 20 results per page

/**
 * Fetches a single page from TMDB now_playing endpoint.
 * @param {number} page - Page number (1-indexed)
 * @param {string} token - Bearer token
 * @returns {Promise<{results: Array, total_pages: number}>}
 */
async function fetchTmdbPage(page, token) {
	const url = `https://api.themoviedb.org/3/movie/now_playing?language=es-AR&page=${page}`;
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		const errText = await response.text();
		throw new Error(`TMDB API error on page ${page}: ${response.status} ${response.statusText} — ${errText}`);
	}

	return response.json();
}

/**
 * Handles the POST request to fetch now-playing movies from TMDB
 * and stores/updates them in the active storage layer (JSON or Strapi).
 *
 * Accepts an optional JSON body: { cantidad: 20 | 40 | 60 }
 * Defaults to 20 (1 page). Iterates through as many TMDB pages as needed
 * to reach the requested quantity, then deduplicates and saves all movies.
 */
export async function POST({ request }) {
	try {
		if (!TMDB_API_TOKEN) {
			return json(
				{ error: 'El token TMDB_API_TOKEN no está configurado en el servidor.' },
				{ status: 500 }
			);
		}

		// Parse optional body — default to 20 movies (1 page)
		let cantidad = 20;
		try {
			const body = await request.json();
			if (body?.cantidad && Number.isInteger(body.cantidad) && body.cantidad > 0) {
				cantidad = body.cantidad;
			}
		} catch {
			// No body or invalid JSON → use default
		}

		// Calculate how many TMDB pages we need
		const pagesNeeded = Math.ceil(cantidad / TMDB_PAGE_SIZE);

		// 1. Fetch the first page to know the total available pages on TMDB
		const firstPageData = await fetchTmdbPage(1, TMDB_API_TOKEN);
		const tmdbTotalPages = firstPageData.total_pages ?? 1;
		const maxPages = Math.min(pagesNeeded, tmdbTotalPages);

		// Collect all movies, starting with page 1
		const allMovies = [...(firstPageData.results || [])];

		// Fetch remaining pages sequentially
		for (let page = 2; page <= maxPages; page++) {
			console.log(`[generar] Fetching TMDB page ${page}/${maxPages}…`);
			const pageData = await fetchTmdbPage(page, TMDB_API_TOKEN);
			allMovies.push(...(pageData.results || []));
		}

		// Deduplicate by TMDB id and trim to the requested quantity
		const seen = new Set();
		const movies = [];
		for (const m of allMovies) {
			if (!seen.has(m.id)) {
				seen.add(m.id);
				movies.push(m);
				if (movies.length >= cantidad) break;
			}
		}

		if (movies.length === 0) {
			return json({
				success: true,
				message: 'No se encontraron películas en cartelera actualmente en TMDB.',
				count: 0
			});
		}

		let savedCount = 0;
		const errors = [];

		// 2. Process each movie and sync it to the active storage layer (without city field)
		for (const movie of movies) {
			const posterUrl = movie.poster_path
				? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
				: null;

			// Map TMDB fields (no 'ciudad' field according to rules)
			const movieData = {
				title: movie.title,
				overview: movie.overview || '',
				poster_path: posterUrl,
				vote_average: Number(movie.vote_average) || 0,
				release_date: movie.release_date || null,
				tmdb_id: movie.id
			};

			try {
				// Persist via active adapter
				await storage.guardarPelicula(movieData);
				savedCount++;
			} catch (err) {
				console.error(`[generar] Error guardando película id ${movie.id} (${movie.title}):`, err);
				errors.push({
					id: movie.id,
					title: movie.title,
					error: err.message
				});
			}
		}

		return json({
			success: true,
			message: `Sincronización finalizada (${storageMode.toUpperCase()}). Se obtuvieron ${maxPages} página(s) de TMDB y se guardaron/actualizaron ${savedCount} de ${cantidad} películas solicitadas.`,
			count: savedCount,
			pages_fetched: maxPages,
			errors: errors.length > 0 ? errors : undefined
		});

	} catch (error) {
		console.error('[generar] Error interno en endpoint:', error);
		return json(
			{ error: 'Error interno en el servidor.', details: error.message },
			{ status: 500 }
		);
	}
}
