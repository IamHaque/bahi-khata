import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";

interface SegmentedFieldOption {
  value: string;
  label: string;
}

interface SegmentedFieldProps {
  name: string;
  label: string;
  options: SegmentedFieldOption[];
}

export function SegmentedField({ name, label, options }: SegmentedFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const error = errors[name]?.message;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <div className="space-y-1.5">
          <span id={`${name}-label`} className="text-sm font-medium text-foreground">
            {label}
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${name}-label`}
            className="flex gap-1"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={field.value === option.value}
                onClick={() => field.onChange(option.value)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  field.value === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {error && (
            <p id={`${name}-error`} role="alert" className="text-sm text-destructive">
              {String(error)}
            </p>
          )}
        </div>
      )}
    />
  );
}
