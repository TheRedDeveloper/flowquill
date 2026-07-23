import { germanKeyMap } from "./german";

export function isGermanLayout(): boolean {
  return process.env.FLOWQUILL_LAYOUT === "german";
}

export function remapKeyToken(token: string, useGerman = isGermanLayout()): string {
  if (!useGerman) {
    return token;
  }
  let result = "";
  for (const char of token) {
    result += germanKeyMap[char] ?? char;
  }
  return result;
}

export function formatKeyTokens(text: string, useGerman = isGermanLayout()): string {
  // Matches backtick wrapped key tokens like `h`, `⎈d`, `[`, etc.
  return text.replace(/`([^`]+)`/g, (_, token: string) => {
    const remapped = remapKeyToken(token, useGerman);
    return `<kbd>${remapped}</kbd>`;
  });
}
