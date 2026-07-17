<script>
	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';
	import { CIUDADES, perteneceACiudad } from '$lib/ciudades.js';

	// Svelte 5 Runes for State Management
	let ciudadSeleccionada = $state('Buenos Aires');
	let cantidadSeleccionada = $state(20);
	let allMovies = $state([]);
	let loading = $state(false);
	let loadingMessage = $state('');
	let status = $state({ type: '', message: '' });
	let mostrarConfirmacionRecarga = $state(false);
	let textoBusqueda = $state('');
	let loadingElapsedSeconds = $state(0);
	let elapsedInterval = null;

	// Canvas reference for Chart.js
	let canvasElement = $state(null);
	let chartInstance = null;

	// Derived states: Filtered movies based on pure city rules
	let movies = $derived(
		allMovies.filter(m => perteneceACiudad(Number(m.tmdb_id), ciudadSeleccionada))
	);

	// Derived metrics calculated from the filtered subset
	let averageRating = $derived(
		movies.length > 0 
			? (movies.reduce((sum, m) => sum + Number(m.vote_average), 0) / movies.length).toFixed(2) 
			: '0.00'
	);
	
	let movieCount = $derived(movies.length);

	// Derived search-filtered movies (only affects cards rendering)
	let moviesFiltradas = $derived(
		movies.filter(m => {
			if (!textoBusqueda.trim()) return true;
			const normalize = str =>
				(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
			const query = normalize(textoBusqueda);
			const enTitulo = normalize(m.title).includes(query);
			const enOverview = normalize(m.overview).includes(query);
			return enTitulo || enOverview;
		})
	);

	/**
	 * Renders or updates the Chart.js bar chart
	 */
	function renderChart(movieList) {
		if (!canvasElement) return;

		// Clean up existing chart
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = null;
		}

		if (movieList.length === 0) return;

		const labels = movieList.map(m => m.title);
		const ratings = movieList.map(m => m.vote_average);

		const promedioLinePlugin = {
			id: 'promedioLine',
			afterDraw(chart) {
				const { ctx, chartArea, scales } = chart;
				const valor = Number(averageRating);
				if (!chartArea || isNaN(valor) || valor === 0) return;

				const y = scales.y.getPixelForValue(valor);
				ctx.save();
				ctx.strokeStyle = '#f87171'; // rojo suave, contrasta con cyan/violeta
				ctx.setLineDash([6, 4]);
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(chartArea.left, y);
				ctx.lineTo(chartArea.right, y);
				ctx.stroke();
				ctx.restore();
			}
		};

		chartInstance = new Chart(canvasElement, {
			type: 'bar',
			plugins: [promedioLinePlugin],
			data: {
				labels: labels,
				datasets: [{
					label: 'Rating Promedio (Vote Average)',
					data: ratings,
					backgroundColor: 'rgba(6, 182, 212, 0.45)', // Custom Cyan glow
					borderColor: '#06b6d4',
					borderWidth: 1.5,
					borderRadius: 6,
					hoverBackgroundColor: 'rgba(139, 92, 246, 0.65)', // Custom Purple glow
					hoverBorderColor: '#8b5cf6'
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						labels: {
							color: '#f8fafc',
							font: {
								family: 'Inter',
								weight: '500'
							}
						}
					},
					tooltip: {
						backgroundColor: '#0f172a',
						titleColor: '#f8fafc',
						bodyColor: '#e2e8f0',
						borderColor: 'rgba(255, 255, 255, 0.1)',
						borderWidth: 1
					}
				},
				scales: {
					y: {
						min: 0,
						max: 10,
						grid: {
							color: 'rgba(255, 255, 255, 0.05)'
						},
						ticks: {
							color: '#94a3b8',
							font: {
								family: 'Inter'
							}
						}
					},
					x: {
						grid: {
							display: false
						},
						ticks: {
							color: '#94a3b8',
							font: {
								family: 'Inter',
								size: 10
							},
							callback: function(value) {
								const label = this.getLabelForValue(value);
								return label.length > 12 ? label.slice(0, 12) + '...' : label;
							}
						}
					}
				}
			}
		});
	}

	/**
	 * Pulls the entire movie list from storage via local proxy API route
	 */
	async function visualizarDatos(auto = false) {
		loading = true;
		loadingMessage = 'Consultando base de datos en el servidor...';
		status = { type: '', message: '' };

		try {
			const res = await fetch('/api/peliculas');

			if (!res.ok) {
				throw new Error(`El servidor devolvió estado ${res.status}`);
			}

			const resData = await res.json();
			const rawMovies = resData.data || [];

			// Parse items handles both Strapi v4 envelope and v5 shapes
			allMovies = rawMovies.map(item => {
				if (item.attributes) {
					return { id: item.id, ...item.attributes };
				}
				return item;
			});

			if (allMovies.length === 0) {
				status = {
					type: 'info',
					message: auto
						? 'No hay películas cargadas en el sistema. Seleccioná una cantidad y presioná "Cargar datos de APIs".'
						: 'No se encontraron películas en la base de datos. Intentá cargando datos primero.'
				};
			} else {
				status = {
					type: 'success',
					message: `Catálogo de ${allMovies.length} películas obtenido del servidor.`
				};
			}

		} catch (err) {
			console.error('Error al visualizar datos:', err);
			status = {
				type: 'error',
				message: `Error al conectar con el backend: ${err.message}. Verificá tu STORAGE_MODE en el .env.`
			};
			allMovies = [];
		} finally {
			loading = false;
		}
	}

	/**
	 * Triggers the intermediate API to import data from TMDB and overwrite storage
	 */
	async function cargarDatos() {
		loading = true;
		loadingMessage = 'Llamando a la API Intermedia (TMDB → Storage)...';
		loadingElapsedSeconds = 0;
		status = { type: '', message: '' };

		elapsedInterval = setInterval(() => {
			loadingElapsedSeconds++;
		}, 1000);

		const controller = new AbortController();
		const clientTimeoutId = setTimeout(() => controller.abort(), 100000); // 100s

		try {
			const res = await fetch('/api/generar', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ cantidad: cantidadSeleccionada }),
				signal: controller.signal
			});

			const resData = await res.json();

			if (!res.ok) {
				throw new Error(resData.error || 'Error de sincronización.');
			}

			status = {
				type: 'success',
				message: resData.message || 'Catálogo de cartelera sincronizado con éxito.'
			};

			// Automatically update the local memory with the fresh collection
			await visualizarDatos();

		} catch (err) {
			console.error('Error al sincronizar datos:', err);
			const mensaje = err.name === 'AbortError'
				? 'La sincronización tardó demasiado y se canceló. Probá con una cantidad menor (20) o reintentá en unos minutos.'
				: `Error al sincronizar datos: ${err.message}`;
			status = {
				type: 'error',
				message: mensaje
			};
		} finally {
			clearTimeout(clientTimeoutId);
			clearInterval(elapsedInterval);
			loading = false;
		}
	}

	/**
	 * Decides whether to show the confirmation modal or load data directly
	 */
	function confirmarYCargar() {
		if (allMovies.length > 0) {
			mostrarConfirmacionRecarga = true;
		} else {
			cargarDatos();
		}
	}

	// Svelte 5 Effect to render chart reactively whenever the filtered movies subset changes
	$effect(() => {
		if (canvasElement && movies) {
			renderChart(movies);
		}
	});

	// Lock body scroll when confirmation modal is visible
	$effect(() => {
		if (mostrarConfirmacionRecarga) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	});

	// Load initial data on mount
	onMount(() => {
		visualizarDatos(true);
	});

	// Cleanup Chart.js instance on component destroy
	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
		}
	});
</script>

<svelte:window onkeydown={(e) => {
	if (e.key === 'Escape' && mostrarConfirmacionRecarga) {
		mostrarConfirmacionRecarga = false;
	}
}} />

<div class="app-container">
	<!-- Header -->
	<header class="app-header">
		<h1 class="app-title-gradient">TP Nro 2 - Grupo Canepa</h1>
		<span class="app-group-badge" id="group-badge">TygWeb UTN FRLP</span>
	</header>

	<div class="main-layout">
		<!-- Sidebar -->
		<aside class="app-sidebar">
			<div class="sidebar-section">
				<label class="sidebar-label" for="city-select">Ciudad a simular</label>
				<select
					id="city-select"
					class="input-field"
					style="background-color: #0b0f19; cursor: pointer;"
					bind:value={ciudadSeleccionada}
					disabled={loading}
				>
					{#each CIUDADES as c}
						<option value={c} style="background-color: #0f172a; color: #f8fafc;">{c}</option>
					{/each}
				</select>
			</div>

			<div class="sidebar-section">
				<label class="sidebar-label" for="quantity-select">Cantidad a cargar</label>
				<select
					id="quantity-select"
					class="input-field"
					style="background-color: #0b0f19; cursor: pointer;"
					bind:value={cantidadSeleccionada}
					disabled={loading}
				>
					<option value={20} style="background-color: #0f172a; color: #f8fafc;">20 películas</option>
					<option value={40} style="background-color: #0f172a; color: #f8fafc;">40 películas</option>
					<option value={60} style="background-color: #0f172a; color: #f8fafc;">60 películas</option>
				</select>
			</div>

			<div class="sidebar-section">
				<button
					id="btn-cargar"
					class="btn btn-primary"
					onclick={confirmarYCargar}
					disabled={loading}
				>
					{#if loading && loadingMessage.includes('TMDB')}
						<div class="spinner"></div>
						Sincronizando...
					{:else}
						Cargar datos de APIs
					{/if}
				</button>

				<button
					id="btn-visualizar"
					class="btn btn-secondary"
					onclick={() => visualizarDatos()}
					disabled={loading}
				>
					Visualizar datos
				</button>
			</div>

			{#if status.message}
				<div class="status-container status-{status.type}" id="status-box">
					<span>{status.message}</span>
				</div>
			{/if}
		</aside>

		<!-- Panel Principal -->
		<main class="main-content">
			{#if loading}
				<div class="status-container status-info">
					<div class="spinner"></div>
					<span>{loadingMessage} ({loadingElapsedSeconds}s)</span>
				</div>
			{/if}

			<!-- Resumen de Métricas -->
			<div class="metrics-row">
				<div class="metric-card glass-panel">
					<span class="metric-title">Ciudad Simulada</span>
					<span class="metric-value" id="metric-city">{ciudadSeleccionada}</span>
				</div>
				<div class="metric-card glass-panel">
					<span class="metric-title">Rating Promedio</span>
					<span class="metric-value" id="metric-avg-rating">{averageRating} / 10</span>
				</div>
				<div class="metric-card glass-panel">
					<span class="metric-title">Películas Filtradas</span>
					<span class="metric-value" id="metric-count">{movieCount}</span>
				</div>
			</div>

			<!-- Gráfico de Barras (Chart.js) -->
			<div class="chart-container glass-panel">
				<h2 class="chart-title">Ratings por Película ({ciudadSeleccionada})</h2>
				{#if movies.length > 0}
					<div class="chart-legend" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); margin-top: -0.25rem; margin-bottom: 0.5rem;">
						<span style="display: inline-block; width: 24px; border-bottom: 2px dashed #f87171;"></span>
						<span>Promedio: {averageRating}</span>
					</div>
				{/if}
				{#if movies.length === 0}
					<div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.95rem; text-align: center; padding: 1rem;">
						No hay películas que cumplan la condición para "{ciudadSeleccionada}" en el catálogo.<br>
						Hacé clic en "Cargar datos de APIs" para sincronizar el catálogo.
					</div>
				{/if}
				<div style="position: relative; flex: 1; min-height: 250px; display: {movies.length === 0 ? 'none' : 'block'};">
					<canvas bind:this={canvasElement} id="rating-chart"></canvas>
				</div>
			</div>

			<!-- Detalle de Películas (Grid de Cards) -->
			<section aria-labelledby="movies-section-title">
				<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
					<h2 id="movies-section-title" style="font-size: 1.5rem; font-family: 'Outfit', sans-serif; margin: 0;">
						Películas en Cartelera
					</h2>
					{#if movies.length > 0}
						<input
							type="search"
							aria-label="Buscar película por título o descripción"
							placeholder="Buscar por título o descripción..."
							class="input-field"
							style="width: 100%; max-width: 320px; background-color: #0b0f19;"
							bind:value={textoBusqueda}
						/>
					{/if}
				</div>

				{#if movies.length === 0}
					<div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-secondary);">
						No hay películas cargadas para mostrar en esta sección bajo la regla de "{ciudadSeleccionada}".
					</div>
				{:else if moviesFiltradas.length === 0}
					<div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-secondary);">
						Ninguna película coincide con '{textoBusqueda}'.
					</div>
				{:else}
					<div class="movies-grid">
						{#each moviesFiltradas as movie (movie.tmdb_id)}
							<article class="movie-card glass-panel">
								<div class="movie-poster-container">
									{#if movie.poster_path}
										<img
											src={movie.poster_path}
											alt="Poster de {movie.title}"
											class="movie-poster"
											loading="lazy"
										/>
									{:else}
										<div style="height: 100%; display: flex; align-items: center; justify-content: center; background: #121824; color: var(--text-muted); font-size: 0.85rem;">
											Sin Póster
										</div>
									{/if}
									<span class="movie-rating-badge">
										★ {Number(movie.vote_average).toFixed(1)}
									</span>
								</div>
								<div class="movie-info">
									<h3 class="movie-title" title={movie.title}>{movie.title}</h3>
									<p class="movie-date">Estreno: {movie.release_date || 'N/D'} | ID: {movie.tmdb_id}</p>
									<p class="movie-overview" title={movie.overview}>
										{movie.overview || 'Sin descripción disponible.'}
									</p>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>
		</main>
	</div>

	<!-- Footer -->
	<footer class="app-footer">
		<p>TygWeb 2026 - Tecnología y Gestión Web (UTN FRLP)</p>
	</footer>

	{#if mostrarConfirmacionRecarga}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			class="modal-backdrop"
			onclick={() => mostrarConfirmacionRecarga = false}
			style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 999;"
		>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div 
				class="glass-panel modal-content"
				onclick={(e) => e.stopPropagation()}
				style="width: 90%; max-width: 500px; padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; border-color: rgba(255, 255, 255, 0.15);"
			>
				<h3 style="font-size: 1.25rem; font-family: 'Outfit', sans-serif; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">
					Confirmar sincronización de catálogo
				</h3>
				<p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin: 0;">
					Se van a traer {cantidadSeleccionada} películas desde TMDB. Las que ya tengas cargadas se actualizan (no se duplican) y las nuevas se agregan al catálogo. ¿Confirmás?
				</p>
				<div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 0.5rem;">
					<button 
						class="btn btn-secondary"
						onclick={() => mostrarConfirmacionRecarga = false}
					>
						Cancelar
					</button>
					<button 
						class="btn btn-primary"
						onclick={() => {
							mostrarConfirmacionRecarga = false;
							cargarDatos();
						}}
					>
						Sí, sincronizar
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
