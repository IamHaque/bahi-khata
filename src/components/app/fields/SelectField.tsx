import { Controller, useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  options: SelectFieldOption[];
  placeholder?: string;
  /**
   * Short labels for the closed trigger, when the option labels are
   * long (the invite dialog's "Viewer — can only see the data" belongs
   * in the dropdown, not in the chosen-value display). Defaults to the
   * option labels themselves.
   */
  triggerLabels?: Record<string, string>;
}

export function SelectField({
  name,
  label,
  options,
  placeholder,
  triggerLabels,
}: SelectFieldProps) {
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
          <Label id={`${name}-label`}>{label}</Label>
          <Select
            value={field.value}
            // Base UI's SelectValue renders the raw value unless the
            // Root knows the labels — that map is this.
            items={
              triggerLabels ??
              Object.fromEntries(
                options.map((option) => [option.value, option.label]),
              )
            }
            onValueChange={field.onChange}
          >
            <SelectTrigger
              id={`${name}-select`}
              aria-labelledby={`${name}-label`}
              aria-invalid={!!error}
              aria-describedby={error ? `${name}-error` : undefined}
              className="w-full"
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
