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
	 * Creates or updates a movie in the local JSON database (agnostic of city)
	 * @param {object} movieData - The movie fields to save
	 * @returns {Promise<object>} - The saved movie item
	 */
	async guardarPelicula(movieData) {
		const db = await readAll();
		const list = db.data || [];

		// Look for duplicate using tmdb_id
		const existingIndex = list.findIndex(item => 
			item.attributes && 
			Number(item.attributes.tmdb_id) === Number(movieData.tmdb_id)
		);

		let savedItem;

		if (existingIndex !== -1) {
			// Update existing item
			list[existingIndex].attributes = {
				...list[existingIndex].attributes,
				...movieData
			};
			savedItem = list[existingIndex];
			console.log(`[jsonStorage] Película "${movieData.title}" (tmdb_id: ${movieData.tmdb_id}) actualizada en JSON.`);
		} else {
			// Create new item
			const nextId = list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
			savedItem = {
				id: nextId,
				attributes: {
					...movieData
				}
			};
			list.push(savedItem);
			console.log(`[jsonStorage] Película "${movieData.title}" (tmdb_id: ${movieData.tmdb_id}) creada en JSON.`);
		}

		await writeAll({ data: list });
		return savedItem;
	},

	/**
	 * Replaces the entire local collection of movies with a new set.
	 * @param {Array<object>} peliculas - List of movie data objects.
	 * @returns {Promise<{ data: Array }>}
	 */
	async reemplazarPeliculas(peliculas) {
		console.log(`[jsonStorage] Reemplazando todas las películas del archivo local con ${peliculas.length} nuevas películas.`);
		const list = peliculas.map((movieData, index) => ({
			id: index + 1,
			attributes: {
				...movieData
			}
		}));
		const dataEnvelope = { data: list };
		await writeAll(dataEnvelope);
		return dataEnvelope;
	}
};
