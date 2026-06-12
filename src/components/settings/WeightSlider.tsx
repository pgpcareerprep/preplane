import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function WeightSlider({
  label,
  helper,
  value,
  onChange,
  color = "hsl(var(--orange-500))",
  disabled = false,
}: {
  label: string;
  helper?: string;
  value: number;
  onChange: (v: number) => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium text-n700">{label}</span>
        <span className="text-[14px] font-bold text-orange-500 tabular-nums">{value}%</span>
      </div>
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        disabled={disabled}
      >
        <Slider.Track className="bg-n200 relative grow rounded-full h-1.5">
          <Slider.Range
            className="absolute rounded-full h-full transition-colors duration-150"
            style={{ background: color }}
          />
        </Slider.Track>
        <Slider.Thumb
          className={cn(
            "block h-[18px] w-[18px] rounded-full bg-card border-2 shadow-md cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-60",
            "focus:outline-none focus-visible:shadow-focus transition-transform duration-150 hover:scale-110",
          )}
          style={{ borderColor: color }}
          aria-label={label}
        />
      </Slider.Root>
      {helper && <p className="text-[12px] text-n400 leading-[1.5]">{helper}</p>}
    </div>
  );
}
