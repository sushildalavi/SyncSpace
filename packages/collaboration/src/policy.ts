export function shouldCreateSnapshot(updateCount: number, threshold: number): boolean {
  return updateCount >= threshold;
}

export function isDuplicateUpdate(seenUpdateIds: Set<string>, updateId: string): boolean {
  return seenUpdateIds.has(updateId);
}

export function recordUpdate(seenUpdateIds: Set<string>, updateId: string): void {
  seenUpdateIds.add(updateId);
}
