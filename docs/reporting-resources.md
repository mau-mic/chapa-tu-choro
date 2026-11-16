# Denunciar — official reporting and assistance resources

Denunciar replaces the existing Actúa label as the third navbar option, after Mapa and Tendencias, at `/denunciar`. It retains the original directory and phone/copy functionality while adding emergency and category guidance. Map remains the default. The directory helps users choose an official Peruvian phone or website according to their situation; it does not receive, store or submit complaints.

## Source register

The public source content was reviewed on **2026-11-11**, using official pages indexed by search. Sources and a human-readable scope are bundled in `frontend/src/lib/reportingResources.ts`:

| Resource | Phone / destination | Official reference and scope |
| --- | --- | --- |
| PNP emergency | `105` | [PNP contact and emergency numbers](https://www.gob.pe/institucion/pnp/contacto-y-numeros-de-emergencias): police emergency channel, highlighted separately from administrative/online procedures. |
| Anti-extortion central | `111` | [MININTER Central 111 campaign](https://www.gob.pe/institucion/mininter/campa%C3%B1as/98274-central-111-contra-extorsiones): specialized national extortion assistance, described by the authority as free, confidential and available around the clock. |
| Violence support | `100` | [MIMP service network](https://www.gob.pe/51970-red-de-servicios): free nationwide orientation and support for family/sexual violence, available around the clock. It is not represented as equivalent to a formal criminal complaint. |
| MININTER Central Única de Denuncias | `1818`; [official CUD portal](https://denuncias.mininter.gob.pe/index) | [MININTER guidance](https://www.gob.pe/es/908-central-unica-de-denuncias-cud): complaints/consultations within the service's listed matters; phone is described as free and available around the clock. |
| Fiscalía online complaint | [Official procedure information](https://www.gob.pe/institucion/mpfn/pages/11324-presentar-denuncia-ante-el-ministerio-publico) | Ministerio Público/Fiscalía requirements and procedure. Users consult the authority's own requirements/hours and proceed from that page; this is not emergency dispatch. |
| PNP digital document complaint | [Official procedure information](https://www.gob.pe/11155) | Limited to loss/theft of documents accepted by that service. It must not be described as a general online crime-reporting portal. |

Direct automated requests to Gob.pe returned **HTTP 418** during this verification. The CUD portal content at `denuncias.mininter.gob.pe/index` was readable and lists the 1818 phone channel and its complaint subjects; no registration form was submitted. Official indexed page content supports the telephone numbers and scopes, but that is not a live availability or completed-transaction check. No calls, complaints or personal information were sent. The review date describes source consultation, not guaranteed service uptime. Entries link to the authorities so users can confirm current requirements and availability. No external dataset is required for this feature, and no unavailable content was replaced with invented data.

## Interaction and privacy

- Every phone action is a native `tel:` link, using the exact short number without an invented international prefix. These short codes correspond to services in Peru. On a supported mobile device the operating system opens its phone handler and controls confirmation/calling. Desktop devices may not have a handler; copying remains available. The web application cannot guarantee an automatic call or detect its completion.
- Copying happens only after an explicit button click. Success is announced only after `navigator.clipboard.writeText` resolves. Missing Clipboard API or permission errors produce an announced manual-copy state with a focused, read-only, selected phone number. No deprecated copy command, external library, analytics or permissions prompt is added by the app.
- Official web links use HTTPS and `target="_blank"` with `rel="noopener noreferrer"`; links explain the new tab to assistive technology. No embedded government page, remote image/preview fetch or background availability check is used.
- Cards use headings, institution labels and scope notes. Emergency assistance, support/orientation and formal procedures are distinguished. A source date and a clear statement that Chapa Tu Choro does not collect complaints are visible.
- The directory needs only the site's static assets. API/database failures do not block it, and it starts no statistics requests while selected. It does not promise offline access to government sites or phone connectivity. Existing map/trends selections remain available on return.

## Local execution and validation

Use the normal README workflow:

```bash
docker compose --profile app up --build -d
# Open http://localhost:5173 and select Denunciar.
```

No import, schema migration, new environment variable, API endpoint, authentication, AWS action or additional service is needed. The native .NET/Vite workflow also works. Existing CORS and rate limiting policies are unchanged because these are outbound navigation actions, not new API integrations.

Run frontend checks with `cd frontend && npm run build && npm test`; build includes TypeScript checking. Tests cover the third navigation option, map filter retention, API failure independence, official HTTPS links and phone intents, clipboard success, denied access and unavailable Clipboard API fallback. Backend build/PostGIS checks remain the README's existing commands. Test phone actions by inspecting or intercepting the `tel:` intent, **never by calling emergency lines as a test**.

## Maintenance

Review every entry against the responsible institution before changing a number, destination, scope or hours. Use direct official content when accessible and clearly record any retrieval limitation. Keep web procedure links on official government domains and do not accept user-provided URLs/numbers. Update the catalogue's review date and this source register together. Keep PNP document-only scope and MIMP orientation scope explicit; do not assume that all agencies or complaint channels handle every crime type. Add no short-lived availability claim without evidence.

## Phase 1 extension

The seven choices are robo/hurto, document loss/theft, extortion, fraud/cybercrime, family/gender violence, another alleged crime, and an incident report to police. The first question asks about immediate danger. Recommendations remain informational: they do not determine legal competence or guarantee that a case can be completed online. Categories route through fixed typed configuration, not AI or free text. No personal fields, evidence upload, analytics or local storage are added.

Additional official references checked on 2026-11-11:

- [Locate a police station](https://www.gob.pe/912): indexed official instructions describe location permission or department/province/district search. The directory is a way to find in-person assistance, not a complaint submission. Live retrieval timed out.
- [Mi Policía Digital](https://www.gob.pe/66396-reporta-incidentes-y-delitos-mediante-la-aplicacion-mi-policia-digital): indexed official instructions describe incident notices via a mobile application and Android/iOS, DNI and email requirements. Live retrieval returned 418. Link to the government guide only; no app-store installation, delivery, acceptance or anonymity is asserted as verified.
- Candidate [Fiscalía portal](https://portal.mpfn.gob.pe/denuncias-en-linea/) timed out. Retain the previously documented official procedure page rather than label this deep link as confirmed operational. That official guidance describes adult eligibility and identity validation; the user must confirm current requirements with the authority.
- Candidate [Línea 100 guide](https://www.gob.pe/44181-recibir-ayuda-en-casos-de-violencia-familiar-y-sexual-linea-100) returned 418. Retain the already cross-checked MIMP service-network reference. No unsupported new eligibility or anonymity rule was introduced.

`reportingDetails` holds methods, requirements, anonymity wording and review evidence/date per channel. A visible note says live availability is unverified, with expanded details distinguishing indexed source content from a successful service transaction. Confidentiality never implies anonymity. `incidentChoices` / `resourcesFor` map the seven selections to the scoped channels. Formal-complaint guidance uses Fiscalía or in-person PNP assistance; the document-only portal is offered specifically for documents. Fraud does not assume the CUD accepts every possible cybercrime. Police-app notices are not counted as formal complaints.

See [Phase 1 implementation and hosting](phase-1-reporting-guide.md) and [Phase 0 assessment](phase-0-assessment.md). Earlier validation entries in `mvp-validation.md` describe the previous directory version.
