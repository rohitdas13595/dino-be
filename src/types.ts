export interface AssetType {
  id: number;
  name: string;
  code: string;
}

export interface Wallet {
  id: string; // BIGINT as string in TS
  user_id: string; // UUID
  asset_type_id: number;
  balance: number; // Decimal
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string; // UUID
  idempotency_key: string;
  transaction_type: "TOP_UP" | "BONUS" | "SPEND";
  user_id: string; // UUID
  asset_type_id: number;
  amount: number; // Decimal
  status: "PENDING" | "COMPLETED" | "FAILED";
  metadata?: any;
  created_at: Date;
}

export interface LedgerEntry {
  id: string; // BIGINT
  transaction_id: string;
  wallet_id: string;
  entry_type: "DEBIT" | "CREDIT";
  amount: number;
  balance_after: number;
  created_at: Date;
}
