// Palette search (THE-493): multi-term substring match — every whitespace token
// must appear in the command's label, keywords, or group (case-insensitive).
// Deterministic and dependency-free; real fuzzy ranking is YAGNI at ~28 commands.
import type { Command } from './commands';

export function filterCommands(commands: Command[], query: string): Command[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return commands;
  return commands.filter((cmd) => {
    const haystack = [cmd.label, cmd.group, ...(cmd.keywords ?? [])].join(' ').toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
