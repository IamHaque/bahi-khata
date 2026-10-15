import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MoneyFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function MoneyField({ name, label, placeholder = "0.00", autoFocus }: MoneyFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const error = errors[name]?.message;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { value, onChange, ...field } }) => (
        <div className="space-y-1.5">
          <Label htmlFor={`${name}-money`}>{label}</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden="true"
            >
              ₹
            </span>
            <Input
              id={`${name}-money`}
              type="number"
              min="0"
              step="0.01"
              placeholder={placeholder}
              autoFocus={autoFocus}
              aria-invalid={!!error}
              aria-describedby={error ? `${name}-error` : undefined}
              className="pl-7 tabular-nums"
              value={value ?? ""}
              onChange={(e) =>
                onChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              {...field}
            />
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
