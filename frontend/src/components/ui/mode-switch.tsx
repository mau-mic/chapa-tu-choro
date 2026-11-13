import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

// A single, required selection with Base UI's roving keyboard focus.
export function ModeSwitch<T extends string>({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <ToggleGroup
      className="mode-switch"
      aria-label={label}
      value={[value]}
      onValueChange={(values) => {
        const next = options.find((option) => option.value === values[0]);
        if (next) onValueChange(next.value);
      }}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="mode-switch-item"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
