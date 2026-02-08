// Test Fixtures - Asset Data
export const assetTypes = {
  gold: {
    id: 1,
    name: "Gold Coins",
    code: "GOLD",
  },
  diamond: {
    id: 2,
    name: "Diamonds",
    code: "DIAMOND",
  },
  loyalty: {
    id: 3,
    name: "Loyalty Points",
    code: "LOYALTY",
  },
};

export const ASSET_CODES = {
  GOLD: "GOLD",
  DIAMOND: "DIAMOND",
  LOYALTY: "LOYALTY",
} as const;

export type AssetCode = (typeof ASSET_CODES)[keyof typeof ASSET_CODES];
