import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, ListFilter } from "lucide-react";

export type TerritoryOption = { code: string; name: string };
export type TerritoryFieldProps = {
  label: string;
  value: string;
  options: TerritoryOption[];
  emptyLabel: string;
  optionText?: (option: TerritoryOption) => string;
  disabled?: boolean;
  onChange: (code: string) => void;
};
export const territorialSearchThreshold = 30;
const SearchableTerritory = lazy(() => import("./SearchableTerritory"));
class SearchBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <>
        {this.props.fallback}
        <p className="field-note" role="alert">
          No se pudo abrir el buscador. Puedes usar la lista completa.
        </p>
      </>
    ) : (
      this.props.children
    );
  }
}
export function TerritoryField({
  label,
  value,
  options,
  emptyLabel,
  optionText = (option) => option.name,
  disabled = false,
  onChange,
}: TerritoryFieldProps) {
  const id = useId();
  const [searching, setSearching] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const restore = useRef(false);
  const searchable = options.length >= territorialSearchThreshold;
  const active = searching && searchable;
  useEffect(() => {
    if (!active && restore.current) {
      select.current?.focus();
      restore.current = false;
    }
  }, [active]);
  const native = (
    <select
      id={id}
      ref={select}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {optionText(option)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="full-row territory-field">
      <div className="territory-label">
        <label htmlFor={id}>{label}</label>
        {searchable && (
          <button
            type="button"
            className="territory-search-toggle"
            disabled={disabled}
            onClick={() => {
              restore.current = active;
              setSearching(!active);
            }}
            aria-label={
              active
                ? `Usar lista de ${label.toLocaleLowerCase("es-PE")}`
                : `Buscar ${label.toLocaleLowerCase("es-PE")}`
            }
          >
            {active ? (
              <ListFilter className="interface-icon" aria-hidden="true" />
            ) : (
              <Search className="interface-icon" aria-hidden="true" />
            )}
            {active ? "Lista" : "Buscar"}
          </button>
        )}
      </div>
      {active ? (
        <SearchBoundary fallback={native}>
          <Suspense
            fallback={
              <>
                {native}
                <p className="field-note" role="status">
                  Preparando buscador…
                </p>
              </>
            }
          >
            <SearchableTerritory
              id={id}
              label={label}
              value={value}
              options={options}
              emptyLabel={emptyLabel}
              disabled={disabled}
              onChange={onChange}
            />
          </Suspense>
        </SearchBoundary>
      ) : (
        native
      )}
    </div>
  );
}
