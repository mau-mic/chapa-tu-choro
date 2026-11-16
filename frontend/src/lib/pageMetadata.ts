export const statisticsSource =
  "https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter";
export interface PageMetadata {
  title: string;
  description: string;
  path: string;
}
export const pages = {
  map: {
    title: "Mapa de denuncias policiales en Perú | Chapa Tu Choro",
    description:
      "Explora denuncias policiales registradas en Perú por departamento, provincia, distrito, período y modalidad. Datos importados de MININTER / SIDPOL.",
    path: "/",
  },
  trends: {
    title: "Estadísticas y tendencias de denuncias en Perú | Chapa Tu Choro",
    description:
      "Consulta la evolución histórica de denuncias policiales en Perú. Compara períodos y territorios; distingue las estadísticas CSV de los registros geográficos.",
    path: "/tendencias",
  },
  action: {
    title:
      "Cómo denunciar un delito en Perú: canales oficiales | Chapa Tu Choro",
    description:
      "Consulta canales oficiales de la PNP, MININTER y Fiscalía para denunciar u obtener orientación en Perú. Revisa los requisitos en la entidad responsable.",
    path: "/denunciar",
  },
  methodology: {
    title: "Fuentes y metodología de las estadísticas | Chapa Tu Choro",
    description:
      "Conoce las fuentes MININTER / SIDPOL e INEI, las unidades de conteo, los períodos disponibles y las limitaciones de Chapa Tu Choro.",
    path: "/metodologia/",
  },
  national: {
    title:
      "Denuncias policiales en Perú: estadísticas por departamento | Chapa Tu Choro",
    description:
      "Consulta cantidades de denuncias policiales por departamento, evolución mensual y modalidades, con período y procedencia de los datos importados.",
    path: "/estadisticas/peru/",
  },
};
export function siteOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "VITE_SITE_URL must be an HTTPS origin without credentials, path, query or fragment",
    );
  }
  return url.origin;
}
export function applyPageMetadata(page: PageMetadata) {
  document.title = page.title;
  for (const [selector, attribute, value] of [
    ['meta[name="description"]', "content", page.description],
    ['meta[property="og:title"]', "content", page.title],
    ['meta[property="og:description"]', "content", page.description],
    ['meta[name="twitter:title"]', "content", page.title],
    ['meta[name="twitter:description"]', "content", page.description],
  ])
    document.querySelector(selector)?.setAttribute(attribute, value);
  const origin = siteOrigin(import.meta.env.VITE_SITE_URL);
  if (origin) {
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", origin + page.path);
    document
      .querySelector('meta[property="og:url"]')
      ?.setAttribute("content", origin + page.path);
  }
}
