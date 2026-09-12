export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  alternate_contact_name: string | null;
  alternate_contact_phone: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionType = "charge" | "payment";

export type TransactionStatus = "active" | "edited" | "voided";

export type TransactionSource = "manual" | "import";

export interface Transaction {
  id: string;
  customer_id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
  note: string | null;
  status: TransactionStatus;
  source: TransactionSource;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerWithBalance extends Customer {
  balance: number;
}
