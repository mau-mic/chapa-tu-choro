import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { siteOrigin } from '../src/lib/pageMetadata';
import { generateSite } from './generate';
import { appFallback, head, pages } from './render';
import { validateSnapshot } from './snapshot';

export function seoPlugin(): Plugin {
  let config: ResolvedConfig;
  let origin: string | null;
  let indexable: boolean;
  let statisticsFile: string | undefined;
  const snapshot = () => {
    const explicit = statisticsFile;
    const path = resolve(config.root, explicit || '.generated/statistics.json');
    if (!existsSync(path) && !explicit) return null;
    return validateSnapshot(JSON.parse(readFileSync(path, 'utf8')));
  };
  const notFound = '<!doctype html><html lang="es"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="robots" content="noindex"><title>Página no encontrada</title></head><body><h1>Página no encontrada</h1><a href="/">Volver al mapa</a></body></html>';
  return {
    name: 'chapa-static-seo',
    configResolved(value) {
      config = value;
      statisticsFile = process.env.SEO_STATISTICS_FILE || loadEnv(config.mode, config.envDir, 'SEO_').SEO_STATISTICS_FILE;
      origin = siteOrigin(config.env.VITE_SITE_URL);
      indexable = Boolean(origin) && config.env.VITE_SEO_NOINDEX !== 'true';
    },
    transformIndexHtml(html) {
      return html.replace('<!--seo-head-->', () => head(pages.map, origin, indexable))
        .replace('<!--seo-fallback-->', () => appFallback('map'));
    },
    closeBundle() {
      if (config.command !== 'build') return;
      const out = resolve(config.root, config.build.outDir);
      const template = readFileSync(resolve(out, 'index.html'), 'utf8');
      if (!template.includes('<!--seo:start-->') || !template.includes('<!--seo:body-->')) throw new Error('Missing static publishing template markers');
      for (const [path, content] of generateSite(template, snapshot(), origin, indexable)) {
        const target = resolve(out, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url || '/', 'http://localhost').pathname;
        // Vite transforms the interactive entry points. Static resource pages need no map JS.
        if (!path.startsWith('/estadisticas/') && path !== '/metodologia/' && path !== '/metodologia') return next();
        const template = '<!--seo:start--><!--seo:end--><link rel="stylesheet" href="/src/styles.css"><!--seo:body--><!--seo:body:end-->';
        const files = generateSite(template, snapshot(), origin, false);
        const body = files.get(`${path.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
        response.statusCode = body ? 200 : 404;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(body || notFound);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        const path = url.pathname;
        // Avoid Vite's SPA fallback treating nonexistent HTML URLs as successful map pages.
        if (path.startsWith('/api/') || path.startsWith('/assets/') || path === '/robots.txt' || path === '/sitemap.xml' || ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png'].includes(path)) return next();
        if (path === '/index.html') return next();
        const valid = path === '/' || /^\/(?:denunciar|tendencias|metodologia)\/?$/.test(path) || /^\/estadisticas\/(?:peru|departamentos\/[a-z0-9-]+)\/?$/.test(path);
        const file = resolve(config.root, config.build.outDir, path === '/' ? 'index.html' : `${path.slice(1).replace(/\/$/, '')}/index.html`);
        if (valid && existsSync(file)) {
          const app = /^\/(?:denunciar|tendencias)\/?$/.test(path);
          const canonical = path === '/' ? path : app ? path.replace(/\/$/, '') : path.replace(/\/?$/, '/');
          if (path !== canonical) {
            response.statusCode = 308;
            response.setHeader('Location', canonical + url.search);
          } else {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(readFileSync(file));
            return;
          }
          response.end();
          return;
        }
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(notFound);
      });
    },
  };
}
