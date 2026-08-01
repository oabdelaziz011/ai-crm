export const SIMULATION_STEP_BATCH_SIZE = 12;

export function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
