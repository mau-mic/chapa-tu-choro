import { useEffect, useRef, useState } from "react";
import { Slider } from "@base-ui/react/slider";
import { clampYears, type YearRange } from "../lib/trendYears";

type Props = {
  value: YearRange;
  bounds: YearRange;
  onCommit: (value: YearRange) => void;
};
export function YearRangeSlider({ value, bounds, onCommit }: Props) {
  const [draft, setDraft] = useState(value);
  const pending = useRef(value);
  const [startYear, endYear] = value;
  useEffect(() => {
    const committed: YearRange = [startYear, endYear];
    pending.current = committed;
    setDraft(committed);
  }, [startYear, endYear]);
  if (bounds[0] === bounds[1])
    return (
      <div className="full-row year-range">
        <strong>Período disponible</strong>
        <p>
          {bounds[0]} — {bounds[1]}
        </p>
        <span>Único año disponible</span>
      </div>
    );
  return (
    <div className="full-row year-range">
      <Slider.Root
        value={draft}
        min={bounds[0]}
        max={bounds[1]}
        step={1}
        largeStep={1}
        thumbCollisionBehavior="none"
        onValueChange={(values, details) => {
          pending.current = clampYears(
            values as YearRange,
            bounds,
            details.activeThumbIndex,
          );
          setDraft(pending.current);
        }}
        onValueCommitted={() => {
          if (
            pending.current[0] !== value[0] ||
            pending.current[1] !== value[1]
          )
            onCommit(pending.current);
        }}
      >
        <Slider.Label>Período disponible</Slider.Label>
        <div className="year-range-values">
          <span>
            Año inicial<strong>{draft[0]}</strong>
          </span>
          <span>
            Año final<strong>{draft[1]}</strong>
          </span>
        </div>
        <Slider.Control className="year-slider-control">
          <Slider.Track className="year-slider-track">
            <Slider.Indicator className="year-slider-indicator" />
            <Slider.Thumb
              index={0}
              className="year-slider-thumb"
              getAriaLabel={() => "Año inicial"}
              getAriaValueText={(_, year) => String(year)}
            />
            <Slider.Thumb
              index={1}
              className="year-slider-thumb"
              getAriaLabel={() => "Año final"}
              getAriaValueText={(_, year) => String(year)}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="year-range-limits">
        <span>{bounds[0]}</span>
        <span>{bounds[1]}</span>
      </div>
      <p>Hasta 10 años. Los períodos sin información se mantienen visibles.</p>
    </div>
  );
}
