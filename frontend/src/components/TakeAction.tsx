import { Phone, Copy, Check, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  emergencyResource,
  reportingResources,
  reportingSourcesReviewedOn,
  reportingDetails,
  incidentChoices,
  resourcesFor,
  type IncidentChoice,
  type ReportingResource,
} from "../lib/reportingResources";
import { Button } from "./ui/button";

function PhoneActions({ phone }: { phone: string }) {
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");
  const manualInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (copyState === "manual") {
      manualInput.current?.focus();
      manualInput.current?.select();
    }
  }, [copyState]);
  const copy = async () => {
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyState("manual");
        return;
      }
      await navigator.clipboard.writeText(phone);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };
  return (
    <div className="reporting-phone">
      <div className="reporting-actions">
        <a
          className="reporting-call"
          href={`tel:${phone}`}
          aria-label={`Llamar al ${phone}`}
        >
          <Phone className="interface-icon" aria-hidden="true" />
          Llamar al <strong>{phone}</strong>
          <ExternalLink className="interface-icon" aria-hidden="true" />
        </a>
        <Button
          variant="ghost"
          onClick={copy}
          disabled={copyState === "copying"}
          aria-label={`Copiar número ${phone}`}
        >
          {copyState === "copied" ? (
            <Check className="interface-icon" aria-hidden="true" />
          ) : (
            <Copy className="interface-icon" aria-hidden="true" />
          )}
          {copyState === "copying" ? "Copiando…" : "Copiar número"}
        </Button>
      </div>
      <div className="reporting-copy-status" role="status" aria-live="polite">
        {copyState === "copied" && `Número ${phone} copiado.`}
        {copyState === "manual" && (
          <>
            <p>
              No se pudo copiar automáticamente. Selecciona el número y usa la
              opción Copiar de tu dispositivo.
            </p>
            <input
              ref={manualInput}
              aria-label={`Número para copiar: ${phone}`}
              value={phone}
              readOnly
              inputMode="tel"
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}
      </div>
    </div>
  );
}
function Resource({
  resource,
  emergency = false,
}: {
  resource: ReportingResource;
  emergency?: boolean;
}) {
  const details = reportingDetails[resource.id];
  return (
    <article
      className={emergency ? "reporting-emergency" : "reporting-resource"}
      aria-labelledby={`resource-${resource.id}`}
    >
      <div className="resource-context">
        <span className="eyebrow">{resource.category}</span>
        <h2 id={`resource-${resource.id}`}>{resource.title}</h2>
        <span className="reporting-institution">{resource.institution}</span>
      </div>
      <div className="resource-detail">
        <p>{resource.description}</p>
        <p className="reporting-scope">{resource.scope}</p>
        <div className="reporting-methods">
          {details.methods.map((method) => (
            <span key={method}>{method}</span>
          ))}
        </div>
        {resource.phone && <PhoneActions phone={resource.phone} />}
        {resource.website && (
          <a
            className="reporting-web"
            href={resource.website.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.website.label}{" "}
            <ExternalLink className="interface-icon" aria-hidden="true" />
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
        {resource.website?.url !== resource.sourceUrl && (
          <a
            className="reporting-source"
            href={resource.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Información oficial: ${resource.title} (se abre en otra pestaña)`}
          >
            Información oficial ↗
          </a>
        )}
        <details className="reporting-verification">
          <summary>Requisitos, anonimato y verificación</summary>
          <dl>
            <dt>Requisitos y límites</dt>
            <dd>{details.requirements}</dd>
            <dt>Anonimato</dt>
            <dd>{details.anonymity}</dd>
            <dt>Estado de la información</dt>
            <dd>{details.verification}</dd>
          </dl>
        </details>
        <p className="reporting-reviewed">
          Fuente revisada:{" "}
          <time dateTime={details.reviewedOn}>{details.reviewedOn}</time> ·
          Disponibilidad en vivo no verificada.
        </p>
      </div>
    </article>
  );
}
export function TakeAction() {
  const [danger, setDanger] = useState<"yes" | "no" | null>(null);
  const [choice, setChoice] = useState<IncidentChoice | "">("");
  const chosen = incidentChoices.find((item) => item.id === choice);
  const resources =
    choice && danger === "no" ? resourcesFor(choice) : reportingResources;
  const reviewed = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${reportingSourcesReviewedOn}T00:00:00Z`));
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="take-action-panel"
      aria-label="Denunciar: guía oficial"
    >
      <div className="take-action-content">
        <div className="reporting-intro">
          <header className="take-action-header">
            <span className="eyebrow">PERÚ / CANALES OFICIALES</span>
            <h1>Encuentra dónde denunciar.</h1>
            <p>
              Encuentra un canal oficial para pedir ayuda, recibir orientación o
              presentar una denuncia. Elige según tu situación.
            </p>
          </header>
          <Resource resource={emergencyResource} emergency />
        </div>
        <p className="reporting-independent">
          Somos una plataforma independiente. Te orientamos hacia servicios del
          Estado; no enviamos denuncias en tu nombre. No ingreses aquí nombres,
          relatos, documentos ni pruebas.
        </p>
        <fieldset id="reporting-guide" className="reporting-guide">
          <legend>1. ¿Hay peligro inmediato?</legend>
          <label>
            <input
              type="radio"
              name="danger"
              checked={danger === "yes"}
              onChange={() => {
                setDanger("yes");
                setChoice("");
              }}
            />
            Sí, necesito ayuda inmediata
          </label>
          <label>
            <input
              type="radio"
              name="danger"
              checked={danger === "no"}
              onChange={() => setDanger("no")}
            />
            No, quiero consultar cómo denunciar
          </label>
        </fieldset>
        {danger === "yes" && (
          <p role="status" className="status-banner">
            Para una emergencia policial, prioriza el 105. Un trámite por
            internet no garantiza respuesta inmediata.
          </p>
        )}
        {danger === "no" && (
          <div className="reporting-guide">
            <label htmlFor="incident-choice">
              2. ¿Qué situación quieres consultar?
            </label>
            <select
              id="incident-choice"
              value={choice}
              onChange={(e) => setChoice(e.target.value as IncidentChoice | "")}
            >
              <option value="">Selecciona una situación</option>
              {incidentChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {chosen && danger === "no" && (
          <p role="status" className="status-banner">
            {chosen.note}
          </p>
        )}
        <section aria-labelledby="reporting-resources-heading">
          <div className="reporting-list-heading">
            <h2 id="reporting-resources-heading">
              {choice && danger === "no"
                ? "Canales para la situación seleccionada"
                : "Directorio de canales oficiales"}
            </h2>
            <span>Teléfono y portales del Estado</span>
          </div>
          {(choice && danger === "no"
            ? [
                {
                  title: "Canales recomendados",
                  description:
                    "Revisa el alcance de cada servicio antes de continuar.",
                  resources,
                },
              ]
            : [
                {
                  title: "Orientación y ayuda especializada",
                  description:
                    "Contacta servicios de apoyo para una situación específica.",
                  resources: resources.filter((resource) =>
                    ["extortion", "violence-support"].includes(resource.id),
                  ),
                },
                {
                  title: "Presentar una denuncia",
                  description:
                    "Consulta los trámites y las materias que atiende cada entidad.",
                  resources: resources.filter((resource) =>
                    ["mininter-cud", "prosecutor", "lost-documents"].includes(
                      resource.id,
                    ),
                  ),
                },
                {
                  title: "Atención presencial y avisos",
                  description:
                    "Encuentra una sede policial o consulta cómo dar aviso de un incidente.",
                  resources: resources.filter((resource) =>
                    ["police-station", "police-app"].includes(resource.id),
                  ),
                },
              ]
          ).map((group) => (
            <section
              className="reporting-group"
              key={group.title}
              aria-label={group.title}
            >
              <div className="reporting-group-heading">
                <h3>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <ul className="reporting-resource-list">
                {group.resources.map((resource) => (
                  <li key={resource.id}>
                    <Resource resource={resource} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
        <aside
          className="reporting-use-note"
          aria-label="Cómo usar estos canales"
        >
          <h2>Antes de continuar</h2>
          <p>
            «Llamar» abre la aplicación de teléfono si tu dispositivo la admite;
            confirma allí la llamada. También puedes copiar el número. Estos
            números cortos corresponden a servicios en el Perú.
          </p>
          <p>
            Los enlaces oficiales se abren en otra pestaña. Revisa allí el
            alcance, los requisitos y los horarios de cada servicio.
          </p>
        </aside>
        <footer className="reporting-footer">
          <p>
            Chapa Tu Choro no recibe denuncias ni guarda datos sobre tu caso.
            Las llamadas y los trámites se realizan directamente con las
            instituciones.
          </p>
          <p>
            Fuentes oficiales consultadas el{" "}
            <time dateTime={reportingSourcesReviewedOn}>{reviewed}</time>. La
            disponibilidad de cada canal depende de la entidad responsable.
          </p>
        </footer>
      </div>
    </main>
  );
}
