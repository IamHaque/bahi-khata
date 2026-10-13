import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagsFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

export function TagsField({ name, label, placeholder, hint }: TagsFieldProps) {
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
          <Label htmlFor={`${name}-tags`}>{label}</Label>
          <Input
            id={`${name}-tags`}
            placeholder={placeholder ?? "wholesale, regular"}
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
