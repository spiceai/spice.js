/**
 * Lossless JSON parsing for query results.
 *
 * `JSON.parse` turns every number into an IEEE-754 double, so an Int64 or
 * UInt64 value outside ±(2^53 - 1) is silently rounded before the SDK ever
 * sees it (9007199254740993 becomes 9007199254740992). The runtime's HTTP
 * responses carry exact integer literals, so this parser keeps any integer
 * literal outside the safe range exact, either as a `bigint` or as its decimal
 * string. Every other value parses exactly as `JSON.parse` would: safe-range
 * integers and non-integer numbers stay `number`s.
 */

/** How integer literals outside the safe range are returned. */
export type UnsafeIntegerMode = 'bigint' | 'string';

const INTEGER_LITERAL = /^-?(?:0|[1-9]\d*)$/;

// Only an integer literal with 16 or more digits can fall outside the safe
// range (MAX_SAFE_INTEGER has 16 digits). A JSON number starts the document or
// follows '[', ':' or ',', so bodies without such a token (long digit runs
// inside ordinary strings, e.g. ids or timestamps, don't match) take the
// native fast path.
const MAYBE_UNSAFE_INTEGER = /(?:^|[[:,])\s*-?\d{16}/;

function convertUnsafe(literal: string, mode: UnsafeIntegerMode): unknown {
  return mode === 'bigint' ? BigInt(literal) : literal;
}

function isUnsafeIntegerLiteral(literal: string): boolean {
  return (
    INTEGER_LITERAL.test(literal) && !Number.isSafeInteger(Number(literal))
  );
}

let reviverSourceSupported: boolean | undefined;

/** Whether this runtime passes `context.source` to JSON.parse revivers (ES2025). */
export function supportsReviverSource(): boolean {
  if (reviverSourceSupported === undefined) {
    try {
      let seen = false;
      JSON.parse('1', (_key: string, value: unknown, context?: unknown) => {
        if (
          context &&
          typeof (context as { source?: unknown }).source === 'string'
        ) {
          seen = true;
        }
        return value;
      });
      reviverSourceSupported = seen;
    } catch {
      reviverSourceSupported = false;
    }
  }
  return reviverSourceSupported;
}

/**
 * Parses JSON, keeping integer literals outside the safe range exact.
 *
 * @param text - JSON text
 * @param mode - `'bigint'` (default) returns unsafe integers as `bigint`;
 *   `'string'` returns their exact decimal string
 * @param forceFallback - test hook: always use the portable parser
 */
export function parseJsonLossless(
  text: string,
  mode: UnsafeIntegerMode = 'bigint',
  forceFallback = false,
): any {
  if (!MAYBE_UNSAFE_INTEGER.test(text)) {
    return JSON.parse(text);
  }
  if (!forceFallback && supportsReviverSource()) {
    return JSON.parse(
      text,
      (_key: string, value: unknown, context?: { source?: string }) => {
        if (
          typeof value === 'number' &&
          !Number.isSafeInteger(value) &&
          typeof context?.source === 'string' &&
          isUnsafeIntegerLiteral(context.source)
        ) {
          return convertUnsafe(context.source, mode);
        }
        return value;
      },
    );
  }
  return new LosslessParser(text, mode).parseDocument();
}

/** Portable recursive-descent parser for runtimes without reviver `source`. */
class LosslessParser {
  private pos = 0;

  constructor(
    private readonly text: string,
    private readonly mode: UnsafeIntegerMode,
  ) {}

  parseDocument(): any {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      this.fail('Unexpected trailing content');
    }
    return value;
  }

  private fail(message: string): never {
    throw new SyntaxError(`${message} in JSON at position ${this.pos}`);
  }

  private skipWhitespace(): void {
    const text = this.text;
    while (this.pos < text.length) {
      const c = text.charCodeAt(this.pos);
      // space, \t, \n, \r
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  private parseValue(): any {
    const c = this.text[this.pos];
    switch (c) {
      case '{':
        return this.parseObject();
      case '[':
        return this.parseArray();
      case '"':
        return this.parseString();
      case 't':
        return this.parseLiteral('true', true);
      case 'f':
        return this.parseLiteral('false', false);
      case 'n':
        return this.parseLiteral('null', null);
      default:
        if (c === '-' || (c >= '0' && c <= '9')) {
          return this.parseNumber();
        }
        return this.fail(
          c === undefined ? 'Unexpected end' : `Unexpected token '${c}'`,
        );
    }
  }

  private parseLiteral(word: string, value: unknown): unknown {
    if (this.text.startsWith(word, this.pos)) {
      this.pos += word.length;
      return value;
    }
    return this.fail('Unexpected token');
  }

  private parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.pos++; // {
    this.skipWhitespace();
    if (this.text[this.pos] === '}') {
      this.pos++;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] !== '"') {
        this.fail('Expected property name');
      }
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.pos] !== ':') {
        this.fail("Expected ':'");
      }
      this.pos++;
      this.skipWhitespace();
      const value = this.parseValue();
      // Match JSON.parse: a "__proto__" key becomes an own property.
      Object.defineProperty(result, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      this.skipWhitespace();
      const next = this.text[this.pos++];
      if (next === '}') {
        return result;
      }
      if (next !== ',') {
        this.pos--;
        this.fail("Expected ',' or '}'");
      }
    }
  }

  private parseArray(): unknown[] {
    const result: unknown[] = [];
    this.pos++; // [
    this.skipWhitespace();
    if (this.text[this.pos] === ']') {
      this.pos++;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      result.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text[this.pos++];
      if (next === ']') {
        return result;
      }
      if (next !== ',') {
        this.pos--;
        this.fail("Expected ',' or ']'");
      }
    }
  }

  private parseString(): string {
    const start = this.pos;
    this.pos++; // opening quote
    const text = this.text;
    let hasEscape = false;
    while (this.pos < text.length) {
      const c = text.charCodeAt(this.pos);
      if (c === 0x22) {
        // closing quote
        this.pos++;
        const raw = text.slice(start, this.pos);
        // Delegate escape decoding and validation to the native parser.
        return hasEscape ? JSON.parse(raw) : raw.slice(1, -1);
      }
      if (c === 0x5c) {
        hasEscape = true;
        this.pos += 2;
        continue;
      }
      if (c < 0x20) {
        this.fail('Bad control character in string literal');
      }
      this.pos++;
    }
    return this.fail('Unterminated string');
  }

  private parseNumber(): unknown {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = this.pos;
    const found = match.exec(this.text);
    if (!found) {
      return this.fail('Invalid number');
    }
    const literal = found[0];
    this.pos += literal.length;
    if (isUnsafeIntegerLiteral(literal)) {
      return convertUnsafe(literal, this.mode);
    }
    return Number(literal);
  }
}
