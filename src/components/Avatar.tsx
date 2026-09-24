import type { CSSProperties } from "react";

interface AvatarProps {
  id: string;
  name: string;
  size?: number;
}

function initials(name: string): string {
  const words = name.trim().replace(/^@/, "").split(/\s+/).filter(Boolean);
  if (/^\+?\d+$/.test(name)) return name.slice(-2);
  return (
    [words[0]?.[0], words.length > 1 ? words.at(-1)?.[0] : words[0]?.[1]]
      .join("")
      .toUpperCase() || "?"
  );
}

function colorIndex(id: string): number {
  return (
    Array.from(id).reduce(
      (hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0,
      0,
    ) % 6
  );
}

export function Avatar({ id, name, size = 42 }: AvatarProps) {
  return (
    <span
      className={`avatar avatar-color-${colorIndex(id)}`}
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
