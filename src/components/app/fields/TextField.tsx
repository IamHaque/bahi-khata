import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  hint?: string;
  /** Overrides the generated input/error ids when two forms with the
   *  same field names can share a page (L-07 quick-add vs the sheet). */
  idPrefix?: string;
}

export function TextField({
  name,
  label,
  placeholder,
  type = "text",
  autoFocus,
  hint,
  idPrefix,
}: TextFieldProps) {
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
          <Label htmlFor={`${idPrefix ?? name}-input`}>{label}</Label>
          <Input
            id={`${idPrefix ?? name}-input`}
            type={type}
            placeholder={placeholder}
            autoFocus={autoFocus}
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
