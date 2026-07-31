export class GrowthCalculator {
  absoluteDifference(currentValue: number, previousValue: number): number {
    return currentValue - previousValue;
  }

  percentageDifference(currentValue: number, previousValue: number): number | null {
    if (previousValue === 0) {
      if (currentValue === 0) return 0;
      return null;
    }
    return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 1000) / 10;
  }
}

export const growthCalculator = new GrowthCalculator();
