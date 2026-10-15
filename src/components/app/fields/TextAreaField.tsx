import { Controller, useFormContext } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface TextAreaFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
  hint?: string;
}

export function TextAreaField({ name, label, placeholder, rows = 3, hint }: TextAreaFieldProps) {
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
          <Label htmlFor={`${name}-textarea`}>{label}</Label>
          <Textarea
            id={`${name}-textarea`}
            placeholder={placeholder}
            rows={rows}
            aria-invalid={!!error}
            aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
            {...field}
          />
          {error ? (
            <p id={`${name}-error`} role="alert" className="text-sm text-destructive">
              {String(error)}
            </p>
          ) : (
            hint && (
              <p id={`${name}-hint`} className="text-xs text-muted-foreground">
                {hint}
              </p>
            )
          )}
        </div>
      )}
    />
  );
}
