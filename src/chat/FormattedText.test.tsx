// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormattedText } from "./FormattedText";

afterEach(cleanup);

describe("простое форматирование текста", () => {
  it("показывает основные выделения и безопасные ссылки", () => {
    render(
      <FormattedText text="**Жирный** __тоже жирный__ *123* *Telegram* _курсив_ ~~удалено~~ `код` [Документ](https://example.com/doc) https://example.com." />,
    );
    expect(screen.getByText("Жирный").tagName).toBe("STRONG");
    expect(screen.getByText("тоже жирный").tagName).toBe("STRONG");
    expect(screen.getByText("123").tagName).toBe("STRONG");
    expect(screen.getByText("Telegram").tagName).toBe("STRONG");
    expect(screen.getByText("курсив").tagName).toBe("EM");
    expect(screen.getByText("удалено").tagName).toBe("S");
    expect(screen.getByText("код").tagName).toBe("CODE");
    expect(
      screen.getByRole("link", { name: "Документ" }).getAttribute("href"),
    ).toBe("https://example.com/doc");
    const url = screen.getByRole("link", { name: "https://example.com" });
    expect(url.getAttribute("href")).toBe("https://example.com/");
    expect(url.getAttribute("rel")).toBe("noopener noreferrer");
    expect(url.nextSibling?.textContent).toBe(".");
  });

  it("сохраняет скобки внутри ссылок и отделяет внешние скобки и пунктуацию", () => {
    const text =
      "[Документ](https://example.com/a_(b_(c))) (https://example.com/a_(b)). [https://example.com/?q[]=1&filter=[open]] [IPv6](https://[::1]/) or [subscribe to Telegram Premium](tg://premium_offer?ref=spambot) to get less strict limits. tg://resolve?domain=SpamBot";
    const { container } = render(<FormattedText text={text} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://example.com/a_(b_(c))",
      "https://example.com/a_(b)",
      "https://example.com/?q[]=1&filter=[open]",
      "https://[::1]/",
      "tg://premium_offer?ref=spambot",
      "tg://resolve?domain=SpamBot",
    ]);
    expect(container.textContent).toBe(
      "Документ (https://example.com/a_(b)). [https://example.com/?q[]=1&filter=[open]] IPv6 or subscribe to Telegram Premium to get less strict limits. tg://resolve?domain=SpamBot",
    );
    expect(
      screen
        .getByRole("link", { name: "subscribe to Telegram Premium" })
        .getAttribute("href"),
    ).toBe("tg://premium_offer?ref=spambot");
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("оставляет HTML и небезопасные ссылки обычным текстом", () => {
    const text =
      "<img src=x onerror=alert(1)> [плохая](javascript:alert(1)) [данные](data:text/html,hello) [файл](file:///tmp/test) [локальная](/settings) https://user:secret@example.com tg://user:secret@resolve?domain=SpamBot";
    const { container } = render(<FormattedText text={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelector("img, script, a")).toBeNull();
  });

  it("сохраняет пробелы, переносы, незакрытые маркеры и буквальный текст внутри кода", () => {
    const text =
      "Две  строки\nsnake_case *незакрытый; `*буквально* [текст](https://example.com/a_(b))` [незакрытый](https://example.com/a_(b)";
    const { container } = render(<FormattedText text={text} />);
    expect(container.textContent).toBe(
      "Две  строки\nsnake_case *незакрытый; *буквально* [текст](https://example.com/a_(b)) [незакрытый](https://example.com/a_(b)",
    );
    expect(
      screen.getByText("*буквально* [текст](https://example.com/a_(b))")
        .tagName,
    ).toBe("CODE");
    expect(container.querySelector("a, em, strong")).toBeNull();
  });
});
