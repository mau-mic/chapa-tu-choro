import { useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import type { TerritoryFieldProps, TerritoryOption } from "./TerritoryField";
const resultLimit = 40;
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-PE")
    .trim();
const optionLabel = (item: TerritoryOption) =>
  item.code ? `${item.name} · ${item.code}` : item.name;
export default function SearchableTerritory({
  id,
  label,
  value,
  options,
  emptyLabel,
  disabled = false,
  onChange,
}: TerritoryFieldProps & { id: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => [{ code: "", name: emptyLabel }, ...options],
    [emptyLabel, options],
  );
  const matching = useMemo(() => {
    const search = normalize(query);
    return items.filter((item) =>
      normalize(optionLabel(item)).includes(search),
    );
  }, [items, query]);
  const visible = useMemo(() => matching.slice(0, resultLimit), [matching]);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <Combobox.Root
      items={items}
      filteredItems={visible}
      filter={null}
      value={items.find((item) => item.code === value) ?? null}
      itemToStringLabel={optionLabel}
      itemToStringValue={(item) => item.code}
      isItemEqualToValue={(item, selected) => item.code === selected.code}
      inputValue={query}
      onInputValueChange={(text, details) => {
        setQuery(text);
        if (details.reason === "input-change") setOpen(true);
      }}
      open={open && !disabled}
      onOpenChange={setOpen}
      disabled={disabled}
      autoHighlight
      onValueChange={(item) => {
        if (item) {
          onChange(item.code);
          setOpen(false);
        }
      }}
    >
      <Combobox.InputGroup className="territory-search-input">
        <Combobox.Input
          ref={input}
          id={id}
          placeholder="Nombre o UBIGEO…"
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
        />
        <Combobox.Trigger
          aria-label={`Abrir opciones de ${label.toLocaleLowerCase("es-PE")}`}
        >
          <ChevronDown className="interface-icon" aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <p className="field-note" id={`${id}-hint`}>
        Busca por nombre o código. No cambia la selección hasta elegir un
        resultado.
      </p>
      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={6}
          align="start"
          className="territory-search-positioner"
        >
          <Combobox.Popup className="territory-search-popup">
            <Combobox.Empty className="territory-search-empty">
              No hay coincidencias.
            </Combobox.Empty>
            <Combobox.List className="territory-search-list">
              {(item: TerritoryOption) => (
                <Combobox.Item
                  key={item.code}
                  value={item}
                  className="territory-search-item"
                >
                  <span>
                    <strong>{item.name}</strong>
                    {item.code && <small>{item.code}</small>}
                  </span>
                  <Combobox.ItemIndicator>
                    <Check className="interface-icon" aria-hidden="true" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {matching.length > resultLimit && (
              <p className="territory-search-limit" role="status">
                {resultLimit} de {matching.length} coincidencias. Escribe para
                acotar o usa la lista completa.
              </p>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
