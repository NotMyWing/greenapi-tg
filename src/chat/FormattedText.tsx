import { Fragment } from "react";
import type { ReactNode } from "react";

// *текст* выделяем жирным, _текст_ курсивом. Текст в обратных кавычках выводим как код.
const inline =
  /`([^`\n]+)`|\[([^\]\n]+)\]\(((?:https?|tg):\/\/)|((?:https?|tg):\/\/)|\*\*([^*`\n]+)\*\*|__([^_`\n]+)__|~~([^~`\n]+)~~|(?<![\w*])\*([^*`\n]+)\*(?!\*)|(?<![\w_])_([^_`\n]+)_(?!\w)/gi;

// Сохраняем пары скобок в адресе. Внешние скобки оставляем в тексте.
function urlEnd(text: string, start: number): number {
  const closing: string[] = [];
  let end = start;
  for (; end < text.length; end++) {
    const char = text[end]!;
    if (/[\s<>"'`]/.test(char)) break;
    if (char === "(") closing.push(")");
    else if (char === "[") closing.push("]");
    else if ((char === ")" || char === "]") && closing.pop() !== char) break;
  }
  return end;
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return /^(?:https?|tg):$/.test(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function FormattedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = new RegExp(inline);
  let position = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const [
      matchedText,
      code,
      label,
      linkProtocol,
      bareProtocol,
      bold,
      underscoreBold,
      strikethrough,
      telegramBold,
      italic,
    ] = match;
    const protocol = linkProtocol ?? bareProtocol;
    parts.push(text.slice(position, match.index));
    let raw = matchedText;
    let content: ReactNode = raw;
    if (code) content = <code>{code}</code>;
    else if (protocol) {
      const start = pattern.lastIndex - protocol.length;
      const end = urlEnd(text, start);
      const closed = !linkProtocol || text[end] === ")";
      raw = text.slice(match.index, end + (linkProtocol && closed ? 1 : 0));
      pattern.lastIndex = match.index + raw.length;
      content = raw;
      const candidate = text.slice(start, end);
      const address = linkProtocol
        ? candidate
        : candidate.replace(/[.,!?;:]+$/, "");
      const href = safeHref(address);
      if (closed && href)
        content = (
          <>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label ?? address}
            </a>
            {bareProtocol ? raw.slice(address.length) : ""}
          </>
        );
    } else {
      const value =
        bold ?? underscoreBold ?? strikethrough ?? telegramBold ?? italic;
      if (value && value.trim() === value) {
        if (bold || underscoreBold || telegramBold)
          content = <strong>{value}</strong>;
        else if (strikethrough) content = <s>{value}</s>;
        else content = <em>{value}</em>;
      }
    }
    parts.push(<Fragment key={match.index}>{content}</Fragment>);
    position = match.index + raw.length;
  }
  return (
    <span className="message-paragraph">
      {parts}
      {text.slice(position)}
    </span>
  );
}
