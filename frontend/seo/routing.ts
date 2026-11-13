// This artifact is deployed with the same build as the HTML. Only published routes succeed.
export function cloudFrontRouter(files: Iterable<string>) {
  const routes: Record<string, string> = {};
  const redirects: Record<string, string> = {};
  for (const file of files) {
    if (!file.endsWith('index.html')) continue;
    const route = file === 'index.html' ? '/' : `/${file.slice(0, -'index.html'.length)}`;
    const canonical = ['/denunciar/', '/tendencias/'].includes(route) ? route.slice(0, -1) : route;
    routes[canonical] = `/${file}`;
    if (canonical !== '/') redirects[canonical.endsWith('/') ? canonical.slice(0, -1) : canonical + '/'] = canonical;
  }
  return `function handler(event) {
  var request = event.request;
  var routes = ${JSON.stringify(routes)};
  var redirects = ${JSON.stringify(redirects)};
  var uri = request.uri;
  if (Object.prototype.hasOwnProperty.call(redirects, uri)) {
    var pairs = [];
    var query = request.querystring || {};
    Object.keys(query).forEach(function(key) {
      var values = query[key].multiValue || [query[key]];
      values.forEach(function(item) { pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.value)); });
    });
    return {statusCode: 308, headers: {location: {value: redirects[uri] + (pairs.length ? '?' + pairs.join('&') : '')}}};
  }
  if (Object.prototype.hasOwnProperty.call(routes, uri)) {
    request.uri = routes[uri];
    return request;
  }
  if (uri.indexOf('/assets/') === 0 || uri === '/robots.txt' || uri === '/sitemap.xml') return request;
  return {statusCode: 404, headers: {'content-type': {value: 'text/html; charset=utf-8'}, 'x-robots-tag': {value: 'noindex'}}, body: '<!doctype html><html lang="es"><head><title>Página no encontrada</title><meta name="robots" content="noindex"></head><body><h1>Página no encontrada</h1><a href="/">Volver al mapa</a></body></html>'};
}
`;
}
