// Test Fixtures - User Data
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
export const TEST_USER_1_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_USER_2_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_USER_3_ID = "33333333-3333-3333-3333-333333333333";

export const testUsers = {
  system: {
    id: SYSTEM_USER_ID,
    name: "System Treasury",
    initialBalance: 1000000000.0,
  },
  user1: {
    id: TEST_USER_1_ID,
    name: "Test User 1",
    initialBalance: 1000.0,
  },
  user2: {
    id: TEST_USER_2_ID,
    name: "Test User 2",
    initialBalance: 500.0,
  },
  user3: {
    id: TEST_USER_3_ID,
    name: "Test User 3",
    initialBalance: 0.0,
  },
};

export function generateTestUserId(): string {
  return crypto.randomUUID();
}
