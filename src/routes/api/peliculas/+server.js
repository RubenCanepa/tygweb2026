import { json } from '@sveltejs/kit';
import { storage } from '$lib/server/storage.js';

/**
 * Handles GET requests to retrieve the entire catalog of movies (city-agnostic)
 * from the active storage layer (JSON or Strapi).
 */
export async function GET() {
	try {
		// Fetch all movies from the active adapter (returns { data: [...] } in both cases)
		const result = await storage.obtenerPeliculas();
		return json(result);
	} catch (error) {
		console.error('[api/peliculas] Error interno obteniendo películas:', error);
		return json(
			{ error: 'Error al obtener películas del servidor.', details: error.message },
			{ status: 500 }
		);
	}
}
