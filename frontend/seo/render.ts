import { pages, statisticsSource, type PageMetadata } from '../src/lib/pageMetadata';
import { departmentPath, nationalMonthly, type Count, type Department, type StatisticsSnapshot } from './snapshot';

export const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const periodLabel = (p: { year: number; month: number }) => `${months[p.month - 1]} ${p.year}`;
const number = (n: number) => n.toLocaleString('es-PE');
const note = '<p class="seo-note">Son cantidades absolutas de denuncias registradas, sin normalizar por población. Más denuncias no implican necesariamente mayor riesgo individual. La ausencia de registros no significa cero. Chapa Tu Choro es un proyecto independiente y no un portal del Gobierno.</p>';
const nav = '<nav class="seo-links" aria-label="Recursos"><a href="/">Mapa interactivo</a><a href="/tendencias">Tendencias</a><a href="/denunciar">Canales para denunciar</a><a href="/estadisticas/peru/">Estadísticas de Perú</a><a href="/metodologia/">Fuentes y metodología</a></nav>';
const source = `<p>Fuente estadística: <a href="${statisticsSource}">MININTER / SIDPOL — catálogo original</a>. Elaboración de tablas: Chapa Tu Choro.</p>`;
export function head(page: PageMetadata, origin: string | null, indexable: boolean, data?: unknown) {
  const url = origin ? origin + page.path : null;
  return `<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="${indexable && origin ? 'index,follow,max-image-preview:large' : 'noindex,follow'}">
<meta property="og:site_name" content="Chapa Tu Choro"><meta property="og:locale" content="es_PE"><meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(page.title)}"><meta name="twitter:description" content="${escapeHtml(page.description)}">
${url ? `<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:url" content="${escapeHtml(url)}">` : ''}
${data ? `<script type="application/ld+json">${json(data)}</script>` : ''}`;
}
export function replaceHead(html: string, metadata: string) {
  return html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => `<!--seo:start-->${metadata}<!--seo:end-->`);
}
export function appFallback(view: 'map' | 'trends' | 'action') {
  const bodies = {
    map: '<h1>Mapa de denuncias policiales en Perú</h1><p>Explora estadísticas históricas por departamento, provincia y distrito, con filtros por período y modalidad. Consulta el mapa interactivo con JavaScript o las tablas de estadísticas en los enlaces siguientes.</p>',
    trends: '<h1>Estadísticas y tendencias de denuncias en Perú</h1><p>Consulta la evolución mensual y las modalidades de denuncias en los datos importados de MININTER / SIDPOL. La fuente geográfica se presenta por separado y sus filas no se suman a los conteos del CSV.</p><p>Los gráficos interactivos requieren JavaScript. Las páginas estadísticas ofrecen tablas legibles sin JavaScript.</p>',
    action: '<h1>Cómo denunciar un delito en Perú</h1><p>Chapa Tu Choro enlaza canales oficiales; no recibe denuncias ni atiende emergencias. Confirma los requisitos y la disponibilidad directamente con cada entidad.</p><ul><li><a href="https://www.gob.pe/912">Directorio oficial de comisarías</a></li><li><a href="https://www.gob.pe/institucion/mpfn/pages/11324-presentar-denuncia-ante-el-ministerio-publico">Guía del Ministerio Público para presentar una denuncia</a></li><li><a href="https://www.gob.pe/es/908-central-unica-de-denuncias-cud">Central Única de Denuncias del MININTER</a></li></ul><p>Con JavaScript puedes explorar el directorio completo de canales, sus alcances y las opciones de teléfono.</p>',
  };
  return `<main id="main-content" tabindex="-1" class="seo-article">${bodies[view]}${nav}${source}${note}</main>`;
}
export function methodology() {
  return `<h1>Fuentes y metodología</h1>
<p>Chapa Tu Choro facilita la consulta de información oficial sobre denuncias policiales en Perú. Es un proyecto independiente; las autoridades citadas son las responsables de las fuentes y los trámites originales.</p>
<h2>¿Qué mide cada fuente?</h2>
<p>Las estadísticas históricas proceden del CSV nacional de MININTER / SIDPOL. Se suman los valores de la columna de cantidad por período, UBIGEO y modalidad. Una fila del CSV es un agregado; no se cuenta como una denuncia individual.</p>
<p>La publicación geográfica del MININTER tiene otra unidad: filas de clasificación de su fuente. Un identificador repetido o una clasificación adicional no demuestran un delito único. Estas filas no se suman a las denuncias del CSV ni se cruzan como si existiera una clave común verificada. Las publicaciones anuales y los archivos por categoría se mantienen separados.</p>
<h2>Cobertura territorial y períodos</h2>
<p>El UBIGEO identifica los territorios. Los límites administrativos del mapa proceden de <a href="https://ide.inei.gob.pe/">INEI</a>; no representan lugares exactos de delitos. Los conteos de distritos sin geometría siguen incluidos en las tablas y totales estadísticos.</p>
<p>Las páginas estadísticas muestran el último mes con registros en el conjunto importado y la evolución mensual disponible para cada territorio. Un mes ausente significa falta de registros en esa selección, no cero denuncias. Un cero se muestra solo cuando está registrado explícitamente. La cobertura nacional de la fuente no garantiza registros para cada distrito o mes.</p>
<h2>Población y tasas mensuales</h2>
<p>Las tendencias y el mapa permiten consultar denuncias por 100.000 habitantes: denuncias del mes divididas entre la población proyectada del mismo año, multiplicadas por 100.000. La fuente es la <a href="https://www.gob.pe/institucion/inei/informes-publicaciones/6894980-peru-poblacion-total-proyectada-al-30-de-junio-de-cada-ano-segun-departamento-provincia-y-distrito-2018-2025">proyección INEI al 30 de junio, 2018–2026</a>. Es preliminar y no incorpora los resultados definitivos del Censo 2025. Las tasas no se anualizan ni se suman; las medias se presentan por separado. Si falta población compatible para algún distrito con denuncias, se conserva el conteo y se omite la tasa afectada.</p>
<p>El histórico usa el denominador de cada año y permite comparar hasta cuatro territorios. Los indicadores muestran meses y distritos con registros, denominadores ausentes y geometrías faltantes; no certifican completitud. Las tablas estadísticas estáticas conservan sus conteos absolutos.</p>
<h2>Medias y referencias históricas</h2>
<p>Las medias móviles usan 3 o 12 meses consecutivos, incluido el mes observado. La referencia histórica usa los 36 meses anteriores y la estacional usa el mismo mes de los tres años previos. Se requieren todas las observaciones de cada ventana, por separado para conteos y tasas; los meses ausentes no se rellenan con ceros. Las referencias pueden usar datos anteriores al rango visible y nunca datos futuros. Son cálculos descriptivos de Chapa Tu Choro, no pronósticos ni explicaciones causales.</p>
<p>La comparación con Perú divide las denuncias nacionales entre la población nacional del mismo año y usa la misma categoría y período que el territorio. Perú incluye el territorio seleccionado; su tasa no es el promedio de las tasas distritales. Las variaciones porcentuales frente a una referencia ausente o cero no se calculan.</p>
<h2>¿Se pueden comparar los distritos como una medida de riesgo?</h2>
<p>No directamente. Los conteos absolutos y las tasas por residentes no ajustan por tránsito de personas ni propensión a denunciar. Las tasas pueden ser inestables en poblaciones pequeñas. No representan todos los hechos ocurridos, y un mayor conteo no demuestra un mayor riesgo individual. No publicamos un ranking de «distritos más peligrosos» a partir de estos totales.</p>
<h2>Procedencia y actualización</h2>
<p>Las tablas publicadas se generan desde una lectura consistente de los agregados importados. Cada edición indica su período, la fecha de exportación y los checksums y fechas de importación de los archivos estadísticos utilizados. La fecha de importación o exportación no es la fecha de ocurrencia de un hecho ni la fecha de publicación del proveedor.</p>
<p>El mapa puede mostrar una importación posterior a la edición estática. Consulta el período de cada página antes de comparar. Los resúmenes se vuelven a publicar tras una exportación y compilación correctas; una falla no autoriza inventar valores faltantes.</p>
<h2>Privacidad y condiciones de uso</h2>
<p>Estos resúmenes no contienen nombres de víctimas, direcciones, identificadores de casos ni coordenadas de hechos. El acceso técnico a una fuente no establece permiso para todos los usos. Las condiciones se evalúan por fuente; no se declara una licencia universal para las publicaciones geográficas.</p>
${source}<p>La concentración geográfica se basa en el <a href="https://aplicaciones.mininter.gob.pe/mapadeldelitogeoreferenciado/">visor original del MININTER</a>, con las limitaciones descritas arriba.</p>${nav}`;
}
function table(caption: string, columns: string[], rows: string[][]) {
  return `${columns.length > 2 ? '<p class="seo-scroll-hint">Desliza la tabla para consultar todas las columnas.</p>' : ''}<div class="seo-table-scroll" tabindex="0" role="region" aria-label="${escapeHtml(caption)}"><table><caption>${escapeHtml(caption)}</caption><thead><tr>${columns.map(c => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((c, i) => i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function statisticalBody(s: StatisticsSnapshot | null, department?: Department) {
  if (!s) return `<h1>Estadísticas de denuncias policiales en Perú</h1><p>No hay una edición de tablas publicada. Puedes consultar los períodos disponibles en el mapa y las tendencias.</p>${nav}${source}${note}`;
  const monthly = department ? department.monthly : nationalMonthly(s);
  const latest = monthly.find(m => m.year === s.period.year && m.month === s.period.month)!;
  const scope = department?.name ?? 'Perú';
  const available = s.departments.filter(d => d.districts.length > 0);
  const categories = new Map<string, number>();
  for (const d of department ? [department] : available) for (const c of d.categories) categories.set(c.name, (categories.get(c.name) ?? 0) + c.reports);
  const comparison = department
    ? table(`Denuncias por distrito · ${periodLabel(s.period)}`, ['Distrito', 'Provincia', 'UBIGEO', 'Denuncias'], [...department.districts].sort((a, b) => b.reports - a.reports || a.code.localeCompare(b.code)).map(d => [escapeHtml(d.name), escapeHtml(d.province), escapeHtml(d.code), number(d.reports)]))
    : table(`Denuncias por departamento · ${periodLabel(s.period)}`, ['Departamento', 'Denuncias'], available.map(d => ({ d, reports: d.monthly.find(m => m.year === s.period.year && m.month === s.period.month)!.reports })).sort((a, b) => b.reports - a.reports || a.d.code.localeCompare(b.d.code)).map(({ d, reports }) => [`<a href="${departmentPath(d)}">${escapeHtml(d.name)}</a>`, number(reports)]));
  return `<h1>Denuncias policiales en ${escapeHtml(scope)}</h1>
<p class="eyebrow">${escapeHtml(periodLabel(s.period))} · Todas las modalidades del CSV</p>
<p>En ${escapeHtml(periodLabel(s.period))}, el conjunto estadístico importado registra <strong>${number(latest.reports)} denuncias</strong> en ${escapeHtml(scope)}. Se trata de cantidades registradas en la fuente, no de una estimación de todos los delitos ocurridos.</p>
${note}${comparison}<h2>Evolución mensual</h2><p>Solo se muestran meses con registros. Los períodos ausentes no se rellenan con ceros.</p>
${table(`Evolución de denuncias en ${scope}`, ['Período', 'Denuncias'], [...monthly].reverse().map(m => [escapeHtml(periodLabel(m)), number(m.reports)]))}
<h2>Modalidades registradas</h2>${table(`Modalidades · ${periodLabel(s.period)}`, ['Modalidad', 'Denuncias'], [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, reports]) => [escapeHtml(name), number(reports)]))}
<p><a href="/${department ? `?department=${department.code}&year=${s.period.year}&month=${s.period.month}` : `?year=${s.period.year}&month=${s.period.month}`}">Explorar este período en el mapa</a></p>
<h2>Fuentes y edición</h2>${source}<p>Edición exportada: <time datetime="${escapeHtml(s.exportedAt)}">${escapeHtml(s.exportedAt)}</time>. Esta fecha no corresponde a la ocurrencia ni a la publicación de los hechos.</p>
<details><summary>Historial de archivos estadísticos utilizados</summary><p>Los agregados pueden incluir varias importaciones. Este historial no asigna cada fila a un único archivo.</p><ul class="seo-provenance">${s.imports.map(i => `<li>Importado: <time datetime="${escapeHtml(i.importedAt)}">${escapeHtml(i.importedAt)}</time> · SHA-256: <code>${escapeHtml(i.sha256)}</code></li>`).join('')}</ul></details>${nav}`;
}
export function dataset(s: StatisticsSnapshot, origin: string, page: PageMetadata, department?: Department) {
  const monthly: Count[] = department ? department.monthly : nationalMonthly(s);
  const date = (p: Count) => `${p.year}-${String(p.month).padStart(2, '0')}-01`;
  return { '@context': 'https://schema.org', '@type': 'Dataset', name: page.title, description: page.description,
    url: origin + page.path, inLanguage: 'es-PE', creator: { '@type': 'Organization', name: 'Chapa Tu Choro' },
    isBasedOn: { '@type': 'Dataset', name: 'Denuncias policiales registradas a nivel nacional — MININTER', url: statisticsSource, creator: { '@type': 'Organization', name: 'MININTER / Policía Nacional del Perú' } },
    spatialCoverage: { '@type': 'Place', name: department ? `${department.name}, Perú` : 'Perú' },
    temporalCoverage: `${date(monthly[0])}/${new Date(Date.UTC(s.period.year, s.period.month, 0)).toISOString().slice(0, 10)}`,
    variableMeasured: 'Cantidad absoluta de denuncias policiales registradas; sin normalizar por población',
  };
}
export function staticDocument(page: PageMetadata, body: string, css: string, origin: string | null, indexable: boolean, structuredData?: unknown) {
  return `<!doctype html><html lang="es-PE"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f6f8">${head(page, origin, indexable, structuredData)}${css}</head><body><header class="site-header seo-site-header"><a class="skip-link" href="#main-content">Saltar al contenido</a><a class="seo-brand" href="/">◈ Chapa Tu Choro</a><a class="seo-header-link" href="/">Abrir mapa</a></header><main id="main-content" tabindex="-1" class="seo-article">${body}</main><footer class="seo-footer">Chapa Tu Choro · Información con fuente y contexto</footer></body></html>`;
}
export function departmentMetadata(d: Department): PageMetadata {
  return { title: `Denuncias en ${d.name}: estadísticas por distrito | Chapa Tu Choro`, description: `Consulta denuncias registradas en ${d.name}, su evolución mensual, modalidades y conteos por distrito. Fuente: MININTER / SIDPOL; cantidades sin normalizar por población.`, path: departmentPath(d) };
}
export { pages };
