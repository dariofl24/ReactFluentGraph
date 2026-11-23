export type JsonTokenKind =
    "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "plain";

export interface JsonToken {
    kind: JsonTokenKind;
    text: string;
}

/** Tokenize a line of JSON.stringify output; render tokens as escaped React text. */
export function tokenizeJsonLine(line: string): JsonToken[] {
    const tokens: JsonToken[] = [];
    const pattern =
        /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\],:]/g;
    let offset = 0;
    for (const match of line.matchAll(pattern)) {
        const start = match.index!;
        if (start > offset)
            tokens.push({kind: "plain", text: line.slice(offset, start)});
        const text = match[0];
        let kind: JsonTokenKind;
        if (text.startsWith('"'))
            kind = line
                .slice(start + text.length)
                .trimStart()
                .startsWith(":")
                ? "key"
                : "string";
        else if (text === "true" || text === "false") kind = "boolean";
        else if (text === "null") kind = "null";
        else if (/^-?\d/.test(text)) kind = "number";
        else kind = "punctuation";
        tokens.push({kind, text});
        offset = start + text.length;
    }
    if (offset < line.length)
        tokens.push({kind: "plain", text: line.slice(offset)});
    return tokens;
}
