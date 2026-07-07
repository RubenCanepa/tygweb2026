export const CIUDADES = ['Buenos Aires', 'La Plata', '9 de Julio'];

/**
 * Pure function to check if a movie belongs to a city based on mathematical rules on its tmdb_id.
 * - Buenos Aires: all movies
 * - La Plata: only even tmdb_ids
 * - 9 de Julio: tmdb_ids divisible by 5
 * 
 * @param {number} tmdb_id 
 * @param {string} ciudad 
 * @returns {boolean}
 */
export function perteneceACiudad(tmdb_id, ciudad) {
	const numericId = Number(tmdb_id);
	if (isNaN(numericId)) return false;

	switch (ciudad) {
		case 'Buenos Aires':
			return true;
		case 'La Plata':
			return numericId % 2 === 0;
		case '9 de Julio':
			return numericId % 5 === 0;
		default:
			return false;
	}
}
