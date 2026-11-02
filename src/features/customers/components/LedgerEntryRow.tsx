import { useState, useRef, type KeyboardEvent, type ChangeEvent } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/app/IconButton";
import { formatDate, formatMoney } from "@/lib/format";
import { todayISO, amountField } from "@/features/transactions/schemas";
import {
  useCreateTransaction,
  useCustomerBalance,
} from "@/features/transactions/hooks";
import { toAppError } from "@/lib/AppError";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface LedgerEntryRowProps {
  businessId: string;
  customerId: string;
  initialBalance?: number;
  initialCharged?: string;
  initialPaid?: string;
  onSuccess?: (newTransactionId: string) => void;
}

export function LedgerEntryRow({
  businessId,
  customerId,
  initialBalance = 0,
  initialCharged = "",
  initialPaid = "",
  onSuccess,
}: LedgerEntryRowProps) {
  const [note, setNote] = useState("");
  const [charged, setCharged] = useState(initialCharged);
  const [paid, setPaid] = useState(initialPaid);
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [activeField, setActiveField] = useState<"charged" | "paid" | null>(null);

  const chargedInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { data: balanceData } = useCustomerBalance(customerId, businessId);
  const currentBalance = balanceData ?? initialBalance;

  const createTx = useCreateTransaction(businessId);
  const isPending = createTx.isPending;

  const hasCharged = charged.trim() !== "";
  const hasPaid = paid.trim() !== "";
  const hasBoth = hasCharged && hasPaid;

  const chargedNum = parseFloat(charged);
  const paidNum = parseFloat(paid);

  let previewBalance = currentBalance;
  if (hasCharged && !isNaN(chargedNum)) {
    previewBalance += chargedNum;
  } else if (hasPaid && !isNaN(paidNum)) {
    previewBalance -= paidNum;
  }

  const isValidAmount = (val: number) => amountField.safeParse(val).success;

  const isValid =
    !hasBoth &&
    ((hasCharged && isValidAmount(chargedNum)) ||
      (hasPaid && isValidAmount(paidNum)));

  const handleChargedChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCharged(val);
    if (val.trim()) {
      setPaid("");
    }
  };

  const handlePaidChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPaid(val);
    if (val.trim()) {
      setCharged("");
    }
  };

  const clearRow = () => {
    setNote("");
    setCharged("");
    setPaid("");
    setOccurredOn(todayISO());
  };

  const handleSubmit = async () => {
    if (!isValid || hasBoth || isPending) return;

    const isCharge = hasCharged;
    const amountVal = isCharge ? chargedNum : paidNum;

    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const occurredAt = new Date(`${occurredOn}T${timeStr}`).toISOString();

    try {
      const res = await createTx.mutateAsync({
        customer_id: customerId,
        type: isCharge ? "charge" : "payment",
        amount: amountVal,
        occurred_at: occurredAt,
        note: note.trim() || undefined,
      });

      clearRow();
      toast.success(isCharge ? "Charge added" : "Payment added");
      onSuccess?.(res.id);
      chargedInputRef.current?.focus();
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isValid && !hasBoth && !isPending) {
        void handleSubmit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearRow();
    }
  };

  return (
    <tr className="bg-primary/5 border-b border-input">
      {/* 1. Date */}
      <td className="px-3 py-2 text-sm tabular-nums text-muted-foreground whitespace-nowrap">
        <div className="flex items-center gap-1">
          <span>{occurredOn === todayISO() ? "Today" : formatDate(occurredOn)}</span>
          <input
            ref={dateInputRef}
            type="date"
            max={todayISO()}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="sr-only"
            id="ledger-entry-date"
            aria-label="Change date"
          />
          <IconButton
            icon={<Calendar className="size-3.5" />}
            label="Change date"
            size="sm"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground touch-target"
            onClick={() => {
              const el = dateInputRef.current;
              if (el?.showPicker) {
                el.showPicker();
              } else {
                el?.focus();
              }
            }}
          />
        </div>
      </td>

      {/* 2. Particulars */}
      <td className="px-3 py-2 margin-rule">
        <label htmlFor="ledger-particulars" className="sr-only">
          Particulars
        </label>
        <Input
          id="ledger-particulars"
          type="text"
          placeholder="What was it for?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
          maxLength={500}
        />
      </td>

      {/* 3. Charged */}
      <td className="px-2 py-2 text-right">
        <label htmlFor="ledger-charged" className="sr-only">
          Charged amount
        </label>
        <Input
          ref={chargedInputRef}
          id="ledger-charged"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={charged}
          onChange={handleChargedChange}
          onFocus={() => setActiveField("charged")}
          onBlur={() => setActiveField(null)}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-8 text-right font-semibold tabular-nums rounded-[3px] border-input",
            activeField === "charged" && "ring-2 ring-primary",
            hasBoth && "border-destructive",
          )}
        />
      </td>

      {/* 4. Paid */}
      <td className="px-2 py-2 text-right">
        <label htmlFor="ledger-paid" className="sr-only">
          Paid amount
        </label>
        <Input
          id="ledger-paid"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={paid}
          onChange={handlePaidChange}
          onFocus={() => setActiveField("paid")}
          onBlur={() => setActiveField(null)}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-8 text-right font-semibold tabular-nums rounded-[3px] border-input",
            activeField === "paid" && "ring-2 ring-primary",
            hasBoth && "border-destructive",
          )}
        />
      </td>

      {/* 5. Balance */}
      <td className="px-2 py-2 text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
        <span aria-live="polite">
          after: {formatMoney(previewBalance)}
        </span>
        {hasBoth && (
          <div role="alert" className="text-[11px] text-destructive font-normal">
            Enter either Charged or Paid
          </div>
        )}
      </td>

      {/* 6. Action / Save */}
      <td className="px-2 py-2 text-right">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={!isValid || isPending || hasBoth}
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </td>
    </tr>
  );
}
