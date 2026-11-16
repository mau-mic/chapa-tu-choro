import { appFallback, dataset, departmentMetadata, head, methodology, pages, replaceHead, staticDocument, statisticalBody } from './render';
import type { StatisticsSnapshot } from './snapshot';
import { cloudFrontRouter } from './routing';

export function generateSite(template: string, snapshot: StatisticsSnapshot | null, origin: string | null, indexable: boolean) {
  const output = new Map<string, string>();
  const css = template.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g)?.join('') ?? '';
  const urls: string[] = [];
  for (const view of ['map', 'trends', 'action'] as const) {
    const page = pages[view];
    const html = replaceHead(template, head(page, origin, indexable)).replace(/<!--seo:body-->[\s\S]*?<!--seo:body:end-->/, () => `<!--seo:body-->${appFallback(view)}<!--seo:body:end-->`);
    output.set(view === 'map' ? 'index.html' : `${page.path.slice(1)}/index.html`, html);
    urls.push(page.path);
  }
  output.set('metodologia/index.html', staticDocument(pages.methodology, methodology(), css, origin, indexable));
  urls.push(pages.methodology.path);
  output.set('estadisticas/peru/index.html', staticDocument(pages.national, statisticalBody(snapshot), css, origin, indexable && snapshot !== null, snapshot && origin ? dataset(snapshot, origin, pages.national) : undefined));
  if (snapshot) {
    urls.push(pages.national.path);
    for (const d of snapshot.departments.filter(d => d.districts.length > 0)) {
      const page = departmentMetadata(d);
      output.set(`${page.path.slice(1)}index.html`, staticDocument(page, statisticalBody(snapshot, d), css, origin, indexable, origin ? dataset(snapshot, origin, page, d) : undefined));
      urls.push(page.path);
    }
  }
  output.set('404.html', staticDocument({ title: 'Página no encontrada | Chapa Tu Choro', description: 'No se encontró la página solicitada.', path: '/404.html' }, '<h1>Página no encontrada</h1><p>La dirección solicitada no existe.</p><a href="/">Volver al mapa de Perú</a>', css, null, false));
  output.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin && indexable ? urls.map(path => `<url><loc>${origin + path}</loc></url>`).join('') : ''}</urlset>\n`);
  const router = cloudFrontRouter(output.keys());
  if (new TextEncoder().encode(router).length > 10000) throw new Error('CloudFront routing exceeds 10 KB; reduce published routes or change the routing strategy');
  output.set('cloudfront-router.js', router);
  output.set('robots.txt', `User-agent: *\nAllow: /\n${origin && indexable ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
  return output;
}
