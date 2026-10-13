import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateFieldProps {
  name: string;
  label: string;
  autoFocus?: boolean;
}

export function DateField({ name, label, autoFocus }: DateFieldProps) {
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
          <Label htmlFor={`${name}-date`}>{label}</Label>
          <Input
            id={`${name}-date`}
            type="date"
            autoFocus={autoFocus}
            aria-invalid={!!error}
            aria-describedby={error ? `${name}-error` : undefined}
            {...field}
          />
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
