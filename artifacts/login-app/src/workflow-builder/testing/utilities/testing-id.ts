let testingEntityCounter = 0;

export function createTestingId(prefix: string): string {
  testingEntityCounter += 1;
  return `${prefix}-${testingEntityCounter}-${Date.now().toString(36)}`;
}
