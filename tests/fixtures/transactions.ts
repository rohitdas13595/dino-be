// Test Fixtures - Transaction Helpers
export function generateIdempotencyKey(prefix: string = "test"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export interface TestTransaction {
  userId: string;
  assetCode: string;
  amount: string;
  idempotencyKey: string;
}

export function createTestTransaction(
  userId: string,
  assetCode: string,
  amount: number | string,
  customKey?: string,
): TestTransaction {
  return {
    userId,
    assetCode,
    amount: amount.toString(),
    idempotencyKey: customKey || generateIdempotencyKey(),
  };
}

export const testAmounts = {
  tiny: "0.01",
  small: "10.50",
  medium: "100.00",
  large: "1000.00",
  huge: "999999999.99",
  zero: "0",
  negative: "-50.00",
};
