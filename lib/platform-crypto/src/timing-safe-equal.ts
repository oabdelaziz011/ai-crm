export function timingSafeEqualHex(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    mismatch |= normalizedLeft.charCodeAt(index) ^ normalizedRight.charCodeAt(index);
  }
  return mismatch === 0;
}
