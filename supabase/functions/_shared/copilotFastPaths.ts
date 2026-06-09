export function isMentorCoverageQuery(message: string): boolean {
  const text = message.toLowerCase();
  return /\bmentors?\b/.test(text) &&
    /\b(ongoing|active|open|process|lmp)\b/.test(text) &&
    /\b(don'?t have|doesn'?t have|without|not aligned|unassigned|need|missing|yet)\b/.test(text);
}

export function shouldPrefetchRag(message: string): boolean {
  return /\b(similar|semantic|precedent|example|historical|previous|past|like this|related|recommend|best match|strong fit)\b/i.test(message);
}

export function isPocWorkloadQuery(message: string): boolean {
  const text = message.toLowerCase();
  return /\bpocs?\b/.test(text) &&
    /\b(workload|active load|capacity|max threshold|conversion rate)\b/.test(text);
}
