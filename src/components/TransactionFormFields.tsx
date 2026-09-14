import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransactionType } from "@/types";

interface TransactionFormFieldsProps {
  type: TransactionType;
  onTypeChange: (type: TransactionType) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  amountRef?: React.RefObject<HTMLInputElement | null>;
  amountError: string | null;
  date: string;
  onDateChange: (value: string) => void;
  dateError: string | null;
  note: string;
  onNoteChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function TransactionFormFields({
  type,
  onTypeChange,
  amount,
  onAmountChange,
  amountRef,
  amountError,
  date,
  onDateChange,
  dateError,
  note,
  onNoteChange,
  disabled,
  idPrefix = "tx",
}: TransactionFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label id={`${idPrefix}-type-label`}>Type *</Label>
        <div
          role="radiogroup"
          aria-labelledby={`${idPrefix}-type-label`}
          className="flex gap-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={type === "charge"}
            onClick={() => onTypeChange("charge")}
            disabled={disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              type === "charge"
                ? "bg-receivable text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            } disabled:opacity-50`}
          >
            Charge
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "payment"}
            onClick={() => onTypeChange("payment")}
            disabled={disabled}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              type === "payment"
                ? "bg-credit text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            } disabled:opacity-50`}
          >
            Payment
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-amount`}>Amount *</Label>
        <Input
          id={`${idPrefix}-amount`}
          ref={amountRef}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          disabled={disabled}
          aria-invalid={!!amountError}
          aria-describedby={amountError ? `${idPrefix}-amount-error` : undefined}
        />
        {amountError && (
          <p id={`${idPrefix}-amount-error`} className="text-sm text-destructive" role="alert">
            {amountError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-date`}>Date *</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!dateError}
          aria-describedby={dateError ? `${idPrefix}-date-error` : undefined}
        />
        {dateError && (
          <p id={`${idPrefix}-date-error`} className="text-sm text-destructive" role="alert">
            {dateError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-note`}>Note</Label>
        <Input
          id={`${idPrefix}-note`}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Optional note"
          disabled={disabled}
        />
      </div>
    </>
  );
}
