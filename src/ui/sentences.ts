// Presentation only: do not alter stored messages, URLs or application titles.
export const sentenceLines = (text: string) => text.replace(/(?<=[다요]\.)[ \t]*(?=\S)/g, "\n")
