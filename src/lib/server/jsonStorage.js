import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'peliculas.json');

/**
 * Ensures the data/ directory and data/peliculas.json file exist.
 */
async function ensureFileExists() {
	try {
		await fs.mkdir(DATA_DIR, { recursive: true });
		try {
			await fs.access(DATA_FILE);
		} catch {
			// Initialize with empty array in Strapi response envelope style
			await fs.writeFile(
				DATA_FILE,
				JSON.stringify({ data: [] }, null, 2),
				'utf-8'
			);
		}
	} catch (err) {
		console.error('[jsonStorage] Error inicializando base de datos JSON local:', err);
		throw err;
	}
}

/**
 * Read all records from the local JSON file.
 */
async function readAll() {
	await ensureFileExists();
	try {
		const raw = await fs.readFile(DATA_FILE, 'utf-8');
		return JSON.parse(raw);
	} catch (err) {
		console.error('[jsonStorage] Error leyendo JSON local:', err);
		return { data: [] };
	}
}

/**
 * Write records back to the local JSON file.
 */
async function writeAll(dataEnvelope) {
	await ensureFileExists();
	try {
		await fs.writeFile(
			DATA_FILE,
			JSON.stringify(dataEnvelope, null, 2),
			'utf-8'
		);
	} catch (err) {
		console.error('[jsonStorage] Error escribiendo en JSON local:', err);
		throw err;
	}
}

export const jsonStorage = {
	/**
	 * Retrieves the entire collection of movies
	 * @returns {Promise<{ data: Array }>}
	 */
	async obtenerPeliculas() {
		return await readAll();
	},

	/**
	 * Empties the database and saves the new movie list (Deprecated)
	 * @param {Array<object>} peliculas - The new batch of movie fields
	 * @returns {Promise<{ data: Array }>} - The saved list wrapped in a Strapi response envelope
	 */
	async reemplazarPeliculas(peliculas) {
		const formattedList = peliculas.map((movie, index) => {
			return {
				id: index + 1,
				attributes: {
					title: movie.title,
					overview: movie.overview,
					poster_path: movie.poster_path,
					vote_average: Number(movie.vote_average) || 0,
					release_date: movie.release_date,
					tmdb_id: Number(movie.tmdb_id)
				}
			};
		});

		const envelope = { data: formattedList };
		await writeAll(envelope);
		console.log(`[jsonStorage] Catálogo reemplazado por completo con ${peliculas.length} películas.`);
		return envelope;
	},

	/**
	 * Performs synchronization: inserts only new movies whose tmdb_id does not exist yet.
	 * Does not delete, does not update existing ones.
	 * @param {Array<object>} peliculas - Batch of movie fields to sync
	 * @returns {Promise<{ data: Array, stats: object }>}
	 */
	async sincronizarPeliculas(peliculas) {
		const actualesEnvelope = await readAll();
		const actuales = actualesEnvelope.data || [];
		const idsExistentes = new Set(actuales.map(p => Number(p.attributes?.tmdb_id || p.tmdb_id)));

		const nuevas = peliculas
			.filter(p => !idsExistentes.has(Number(p.tmdb_id)))
			.map((movie, index) => {
				const nextId = actuales.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + index + 1;
				return {
					id: nextId,
					attributes: {
						title: movie.title,
						overview: movie.overview || '',
						poster_path: movie.poster_path,
						vote_average: Number(movie.vote_average) || 0,
						release_date: movie.release_date || null,
						tmdb_id: Number(movie.tmdb_id)
					}
				};
			});

		const resultado = actuales.concat(nuevas);
		await writeAll({ data: resultado });

		console.log(`[jsonStorage] Sincronización JSON completa: ${nuevas.length} creadas, ${peliculas.length - nuevas.length} omitidas.`);

		return { 
			data: resultado, 
			stats: { 
				creadas: nuevas.length, 
				omitidas: peliculas.length - nuevas.length, 
				fallidas: 0 
			} 
		};
	}
};
