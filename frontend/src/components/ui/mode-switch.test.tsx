import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ModeSwitch } from "./mode-switch";

function Example() {
  const [value, setValue] = useState<"reports" | "geographic">("reports");
  return (
    <ModeSwitch
      label="Fuente"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "reports", label: "Denuncias" },
        { value: "geographic", label: "Delitos" },
      ]}
    />
  );
}

describe("required mode switch", () => {
  it("changes the selected source and prevents clearing the current selection", () => {
    render(<Example />);
    const reports = screen.getByRole("button", { name: "Denuncias" });
    const geographic = screen.getByRole("button", { name: "Delitos" });
    expect(reports).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(geographic);
    expect(geographic).toHaveAttribute("aria-pressed", "true");
    expect(reports).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(geographic);
    expect(geographic).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Fuente" })).toBeVisible();
  });
});
