import { useRef, useState } from "react";
import type { TransactionType } from "@/types";

function todayString(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

interface UseTransactionFormOptions {
  initialType?: TransactionType;
  initialAmount?: string;
  initialDate?: string;
  initialNote?: string;
}

export function useTransactionForm(options: UseTransactionFormOptions = {}) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TransactionType>(options.initialType ?? "charge");
  const [amount, setAmount] = useState(options.initialAmount ?? "");
  const [date, setDate] = useState(options.initialDate ?? todayString());
  const [note, setNote] = useState(options.initialNote ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reset = (opts?: UseTransactionFormOptions) => {
    setType(opts?.initialType ?? "charge");
    setAmount(opts?.initialAmount ?? "");
    setDate(opts?.initialDate ?? todayString());
    setNote(opts?.initialNote ?? "");
    setAmountError(null);
    setDateError(null);
    setSaveError(null);
    setTimeout(() => amountRef.current?.focus(), 50);
  };

  const validate = (): boolean => {
    let valid = true;

    const amountNum = Number(amount.replace(/[₹,\s]/g, ""));
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setAmountError("Amount must be greater than zero");
      valid = false;
    } else {
      setAmountError(null);
    }

    if (!date) {
      setDateError("Date is required");
      valid = false;
    } else {
      const selected = new Date(date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selected > today) {
        setDateError("Date cannot be in the future");
        valid = false;
      } else {
        setDateError(null);
      }
    }

    return valid;
  };

  const getAmount = (): number => Number(amount.replace(/[₹,\s]/g, ""));

  const getOccurredAt = (): string => new Date(date).toISOString();

  return {
    type,
    setType,
    amount,
    setAmount,
    date,
    setDate,
    note,
    setNote,
    amountError,
    dateError,
    saving,
    setSaving,
    saveError,
    setSaveError,
    amountRef,
    reset,
    validate,
    getAmount,
    getOccurredAt,
  };
}
