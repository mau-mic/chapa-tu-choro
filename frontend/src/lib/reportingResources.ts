// Curated from the official references below. No runtime scraping or personal data collection.
// Direct automated requests to Gob.pe were blocked; see docs/reporting-resources.md.
export const reportingSourcesReviewedOn = "2026-11-11";
export interface ReportingResource {
  id: string;
  title: string;
  institution: string;
  category: string;
  description: string;
  scope: string;
  phone?: string;
  website?: { label: string; url: string };
  sourceUrl: string;
}
export const emergencyResource: ReportingResource = {
  id: "police-emergency",
  title: "Emergencia policial",
  institution: "Policía Nacional del Perú",
  category: "PELIGRO INMEDIATO",
  description:
    "Si necesitas intervención policial de emergencia, comunícate con la central policial.",
  scope:
    "Canal de emergencia. Para otros trámites, consulta las opciones de abajo.",
  phone: "105",
  sourceUrl:
    "https://www.gob.pe/institucion/pnp/contacto-y-numeros-de-emergencias",
};
export const reportingResources: ReportingResource[] = [
  {
    id: "extortion",
    title: "Central contra extorsiones",
    institution: "Policía Nacional del Perú / MININTER",
    category: "EXTORSIÓN",
    description:
      "Atención policial especializada para casos de extorsión. La fuente oficial informa atención gratuita y confidencial, las 24 horas.",
    scope: "Atención a nivel nacional para casos de extorsión.",
    phone: "111",
    sourceUrl:
      "https://www.gob.pe/institucion/mininter/campa%C3%B1as/98274-central-111-contra-extorsiones",
  },
  {
    id: "violence-support",
    title: "Línea 100",
    institution: "Ministerio de la Mujer y Poblaciones Vulnerables",
    category: "VIOLENCIA FAMILIAR Y SEXUAL",
    description:
      "Orientación, información y apoyo especializado ante violencia familiar o sexual. Servicio gratuito, las 24 horas y a nivel nacional.",
    scope:
      "Canal de orientación y apoyo; no equivale por sí solo a presentar una denuncia penal.",
    phone: "100",
    sourceUrl: "https://www.gob.pe/51970-red-de-servicios",
  },
  {
    id: "mininter-cud",
    title: "Central Única de Denuncias",
    institution: "Ministerio del Interior",
    category: "DENUNCIAS Y CONSULTAS",
    description:
      "Canal telefónico y digital del MININTER. Consulta en su portal las materias atendidas, como trata de personas, venta de drogas y conductas indebidas del personal policial.",
    scope:
      "La línea 1818 es gratuita y atiende las 24 horas, según la información oficial.",
    phone: "1818",
    website: {
      label: "Ir al portal de denuncias",
      url: "https://denuncias.mininter.gob.pe/index",
    },
    sourceUrl: "https://www.gob.pe/es/908-central-unica-de-denuncias-cud",
  },
  {
    id: "prosecutor",
    title: "Denuncia ante el Ministerio Público",
    institution: "Ministerio Público / Fiscalía de la Nación",
    category: "DENUNCIA POR INTERNET",
    description:
      "Accede a la información oficial para presentar una denuncia ante la Fiscalía por internet.",
    scope:
      "Revisa los requisitos y horarios de atención antes de iniciar. Este trámite no es un canal de respuesta inmediata a emergencias.",
    website: {
      label: "Ver trámite de Fiscalía",
      url: "https://www.gob.pe/institucion/mpfn/pages/11324-presentar-denuncia-ante-el-ministerio-publico",
    },
    sourceUrl:
      "https://www.gob.pe/institucion/mpfn/pages/11324-presentar-denuncia-ante-el-ministerio-publico",
  },
  {
    id: "lost-documents",
    title: "Pérdida o robo de documentos",
    institution: "Policía Nacional del Perú",
    category: "DENUNCIA POLICIAL DIGITAL",
    description:
      "Servicio de denuncia digital para la pérdida o robo de los documentos admitidos por la PNP.",
    scope:
      "Solo para documentos incluidos en el servicio. No es un portal de denuncia general para cualquier delito.",
    website: {
      label: "Ver trámite de documentos",
      url: "https://www.gob.pe/11155",
    },
    sourceUrl: "https://www.gob.pe/11155",
  },
  {
    id: "police-station",
    title: "Ubicar una comisaría",
    institution: "Ministerio del Interior / Policía Nacional del Perú",
    category: "ATENCIÓN PRESENCIAL",
    description:
      "Consulta el directorio oficial para ubicar una comisaría y recibir atención de la PNP.",
    scope:
      "Es un buscador de sedes; abrir el directorio no registra una denuncia.",
    website: {
      label: "Consultar directorio oficial",
      url: "https://www.gob.pe/912",
    },
    sourceUrl: "https://www.gob.pe/912",
  },
  {
    id: "police-app",
    title: "Mi Policía Digital",
    institution: "Policía Nacional del Perú / Ministerio del Interior",
    category: "AVISO DE INCIDENTES",
    description:
      "La guía oficial describe una aplicación para dar aviso a la PNP desde el celular sobre incidentes o hechos delictivos.",
    scope:
      "Consulta la guía oficial antes de descargar. No verificamos instalación, recepción del aviso ni que sustituya una denuncia formal.",
    website: {
      label: "Consultar guía de la aplicación",
      url: "https://www.gob.pe/66396-reporta-incidentes-y-delitos-mediante-la-aplicacion-mi-policia-digital",
    },
    sourceUrl:
      "https://www.gob.pe/66396-reporta-incidentes-y-delitos-mediante-la-aplicacion-mi-policia-digital",
  },
];

export const incidentChoices = [
  {
    id: "theft",
    label: "Robo o hurto",
    channels: ["police-station", "prosecutor"],
    note: "Consulta los canales presenciales y de Fiscalía. La denuncia digital de documentos no cubre por sí sola cualquier robo.",
  },
  {
    id: "documents",
    label: "Pérdida o robo de documentos",
    channels: ["lost-documents", "police-station"],
    note: "El trámite digital se limita a los documentos admitidos por la PNP.",
  },
  {
    id: "extortion",
    label: "Extorsión",
    channels: ["extortion", "police-station", "prosecutor"],
    note: "La Central 111 brinda atención especializada. Consulta a la autoridad cómo continuar con la denuncia.",
  },
  {
    id: "fraud",
    label: "Estafa o delito informático",
    channels: ["prosecutor", "police-station"],
    note: "Consulta a Fiscalía o a la PNP para determinar el trámite que corresponde. No asumimos que toda modalidad pueda resolverse por internet.",
  },
  {
    id: "violence",
    label: "Violencia familiar o de género",
    channels: ["violence-support", "mininter-cud", "police-station"],
    note: "Distingue la orientación especializada de la presentación de una denuncia ante la autoridad.",
  },
  {
    id: "other",
    label: "Otro presunto delito",
    channels: ["prosecutor", "police-station"],
    note: "La autoridad debe confirmar la competencia y los requisitos de tu caso.",
  },
  {
    id: "incident",
    label: "Reporte de un incidente a la policía",
    channels: ["police-app", "police-station"],
    note: "Dar aviso de un incidente mediante una aplicación no se presenta aquí como equivalente a formalizar una denuncia.",
  },
] as const;
export type IncidentChoice = (typeof incidentChoices)[number]["id"];

export interface ReportingDetails {
  methods: string[];
  requirements: string;
  anonymity: string;
  reviewedOn: string;
  verification: string;
}
const indexed =
  "Información contrastada con contenido oficial indexado. No se pudo verificar la disponibilidad en vivo ni completar el trámite.";
export const reportingDetails: Record<string, ReportingDetails> = {
  "police-emergency": {
    methods: ["Teléfono"],
    requirements:
      "Número corto para llamadas en el Perú; necesitas un dispositivo con servicio de telefonía.",
    anonymity: "No verificado; consulta a la entidad. No prometemos anonimato.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
  extortion: {
    methods: ["Teléfono"],
    requirements:
      "Atención especializada para situaciones de extorsión; consulta el procedimiento con la PNP.",
    anonymity:
      "La fuente describe confidencialidad; eso no confirma una denuncia anónima.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
  "violence-support": {
    methods: ["Teléfono"],
    requirements:
      "Orientación ante violencia familiar o sexual. Consulta los siguientes pasos con el servicio.",
    anonymity: "No se confirmó una modalidad de denuncia anónima.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
  "mininter-cud": {
    methods: ["Teléfono", "Internet"],
    requirements:
      "Verifica las materias y los datos solicitados en el portal de la CUD.",
    anonymity:
      "No verificado para todas las materias; no prometemos anonimato.",
    reviewedOn: reportingSourcesReviewedOn,
    verification:
      "Contenido del portal oficial consultado. No se envió una denuncia ni se verificó atención efectiva.",
  },
  prosecutor: {
    methods: ["Internet"],
    requirements:
      "La guía oficial indica mayoría de edad y validación de identidad con DNI o carné de extranjería. Confirma los requisitos actuales en la entidad.",
    anonymity:
      "El procedimiento descrito requiere identificación; no se ofrece como anónimo.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: `${indexed} El acceso directo al portal candidato de Fiscalía devolvió un timeout; se enlaza la guía oficial.`,
  },
  "lost-documents": {
    methods: ["Internet"],
    requirements:
      "Solo documentos admitidos; la guía describe validación de identidad con Reniec. Revisa los términos del trámite en la PNP.",
    anonymity:
      "El procedimiento descrito valida identidad; no se ofrece como anónimo.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
  "police-station": {
    methods: ["Presencial", "Directorio en internet"],
    requirements:
      "El directorio permite buscar por ubicación o departamento, provincia y distrito. Consulta los requisitos de la atención presencial con la comisaría.",
    anonymity:
      "No verificado; consulta el tratamiento de tus datos con la autoridad.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
  "police-app": {
    methods: ["Aplicación móvil"],
    requirements:
      "La guía publicada indica Android o iOS, DNI y correo electrónico. Verifica compatibilidad y disponibilidad actuales antes de instalar.",
    anonymity:
      "La guía describe registro con DNI y correo; no se ofrece como anónimo.",
    reviewedOn: reportingSourcesReviewedOn,
    verification: indexed,
  },
};

export function resourcesFor(choice: IncidentChoice): ReportingResource[] {
  const ids: readonly string[] = incidentChoices.find(
    (item) => item.id === choice,
  )!.channels;
  return ids.map((id) =>
    reportingResources.find((resource) => resource.id === id)!,
  );
}
