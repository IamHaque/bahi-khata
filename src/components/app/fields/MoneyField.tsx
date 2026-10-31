import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface MoneyFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Overrides the generated input/error ids when two forms with the
   * same field names can share a page (L-07: the quick-add card and
   * the transaction sheet both have an `amount` field).
   */
  idPrefix?: string;
  /** Extra classes for the input itself (L-10's hero amount). */
  inputClassName?: string;
}

export function MoneyField({
  name,
  label,
  placeholder = "0.00",
  autoFocus,
  idPrefix,
  inputClassName,
}: MoneyFieldProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const error = errors[name]?.message;
  const errorId = `${idPrefix ?? name}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { value, onChange, ...field } }) => (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix ?? name}-money`}>{label}</Label>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden="true"
            >
              ₹
            </span>
            <Input
              id={`${idPrefix ?? name}-money`}
              type="number"
              min="0"
              step="0.01"
              // The numeric keypad a money field deserves (L-10).
              inputMode="decimal"
              placeholder={placeholder}
              autoFocus={autoFocus}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              className={cn("pl-7 tabular-nums", inputClassName)}
              value={value ?? ""}
              onChange={(e) =>
                onChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              {...field}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {String(error)}
            </p>
          )}
        </div>
      )}
    />
  );
}
