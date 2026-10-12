// Escape special regex characters so user input is matched literally
// (prevents errors on input like "(" and catastrophic-backtracking patterns).
export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
