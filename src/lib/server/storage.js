import { STORAGE_MODE } from '$env/static/private';
import { jsonStorage } from './jsonStorage.js';
import { strapiStorage } from './strapiStorage.js';

// Default to JSON mode if not configured
const mode = (STORAGE_MODE || 'json').toLowerCase().trim();

console.log(`[Storage] Inicializando sistema de persistencia en modo: "${mode}"`);

export const storage = mode === 'strapi' ? strapiStorage : jsonStorage;
export const storageMode = mode;
