/**
 * Safe Arithmetic Calculator Engine
 * Evaluates math expressions without eval() or new Function() to eliminate XSS/security risks.
 * Supports +, -, *, /, %, parentheses (), decimals, and retail pharmacy percentage math (e.g. 100 - 10% = 90).
 */

export interface CalculationResult {
  success: boolean;
  result?: number;
  formatted?: string;
  error?: string;
}

type TokenType = "NUMBER" | "OP" | "LPAREN" | "RPAREN" | "PERCENT";

interface Token {
  type: TokenType;
  value: string | number;
}

/**
 * Tokenizes mathematical expression string.
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const clean = expr.replace(/\s+/g, "");

  while (i < clean.length) {
    const ch = clean[i];

    // Numbers & decimals
    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < clean.length && /[0-9.]/.test(clean[i])) {
        numStr += clean[i];
        i++;
      }
      const parsed = parseFloat(numStr);
      if (isNaN(parsed)) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      tokens.push({ type: "NUMBER", value: parsed });
      continue;
    }

    // Percentage
    if (ch === "%") {
      tokens.push({ type: "PERCENT", value: "%" });
      i++;
      continue;
    }

    // Parentheses
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    // Operators
    if (["+", "-", "*", "/", "x", "X"].includes(ch)) {
      const op = ch === "x" || ch === "X" ? "*" : ch;

      // Handle unary minus (negative number at start or after an operator/lparen)
      if (op === "-") {
        const prev = tokens[tokens.length - 1];
        if (!prev || prev.type === "OP" || prev.type === "LPAREN") {
          // Unary minus: parse subsequent number directly or inject 0 - X
          tokens.push({ type: "NUMBER", value: 0 });
          tokens.push({ type: "OP", value: "-" });
          i++;
          continue;
        }
      }

      tokens.push({ type: "OP", value: op });
      i++;
      continue;
    }

    throw new Error(`Unsupported character: '${ch}'`);
  }

  return tokens;
}

/**
 * Pre-processes percentages in the token stream.
 * In Indian retail pharmacy billing:
 * - "A + B%" evaluates to A + (A * B / 100)
 * - "A - B%" evaluates to A - (A * B / 100)
 * - "A * B%" evaluates to A * (B / 100)
 * - "B%" evaluates to B / 100
 */
function processPercentages(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "PERCENT") {
      const prevNum = result[result.length - 1];
      if (!prevNum || prevNum.type !== "NUMBER") {
        throw new Error("Invalid percentage placement");
      }

      const percentVal = Number(prevNum.value);
      result.pop(); // Remove the number before %

      // Check if preceded by an operator and base number: e.g. Base [+/-] PercentVal %
      if (result.length >= 2) {
        const op = result[result.length - 1];
        const base = result[result.length - 2];
        if (op.type === "OP" && (op.value === "+" || op.value === "-") && base.type === "NUMBER") {
          const baseVal = Number(base.value);
          const computedPercent = (baseVal * percentVal) / 100;
          result.push({ type: "NUMBER", value: computedPercent });
          continue;
        }
      }

      // Default: percent value is value / 100
      result.push({ type: "NUMBER", value: percentVal / 100 });
    } else {
      result.push(t);
    }
  }

  return result;
}

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

/**
 * Evaluates tokens using Shunting-Yard algorithm.
 */
function evaluateTokens(tokens: Token[]): number {
  if (tokens.length === 0) return 0;

  const outputQueue: Token[] = [];
  const opStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === "NUMBER") {
      outputQueue.push(token);
    } else if (token.type === "OP") {
      const op = String(token.value);
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1].type === "OP" &&
        PRECEDENCE[String(opStack[opStack.length - 1].value)] >= PRECEDENCE[op]
      ) {
        outputQueue.push(opStack.pop()!);
      }
      opStack.push(token);
    } else if (token.type === "LPAREN") {
      opStack.push(token);
    } else if (token.type === "RPAREN") {
      let matched = false;
      while (opStack.length > 0) {
        const top = opStack.pop()!;
        if (top.type === "LPAREN") {
          matched = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!matched) {
        throw new Error("Mismatched parentheses");
      }
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop()!;
    if (top.type === "LPAREN" || top.type === "RPAREN") {
      throw new Error("Mismatched parentheses");
    }
    outputQueue.push(top);
  }

  // Evaluate RPN
  const evalStack: number[] = [];
  for (const token of outputQueue) {
    if (token.type === "NUMBER") {
      evalStack.push(Number(token.value));
    } else if (token.type === "OP") {
      const b = evalStack.pop();
      const a = evalStack.pop();
      if (a === undefined || b === undefined) {
        throw new Error("Malformed expression");
      }

      let res = 0;
      switch (token.value) {
        case "+":
          res = a + b;
          break;
        case "-":
          res = a - b;
          break;
        case "*":
          res = a * b;
          break;
        case "/":
          if (b === 0) {
            throw new Error("Division by zero");
          }
          res = a / b;
          break;
        default:
          throw new Error(`Unknown operator: ${token.value}`);
      }
      evalStack.push(res);
    }
  }

  if (evalStack.length !== 1) {
    throw new Error("Malformed expression");
  }

  return evalStack[0];
}

/**
 * Safely evaluates a math expression string and returns the result.
 */
export function evaluateMathExpression(expr: string): CalculationResult {
  if (!expr || !expr.trim()) {
    return { success: true, result: 0, formatted: "0" };
  }

  try {
    const rawTokens = tokenize(expr);
    const processed = processPercentages(rawTokens);
    const rawResult = evaluateTokens(processed);

    if (!isFinite(rawResult) || isNaN(rawResult)) {
      return { success: false, error: "Result is not a finite number" };
    }

    // Round to 4 decimal places to eliminate floating point imprecision (e.g. 0.1 + 0.2 = 0.3)
    const rounded = Math.round(rawResult * 10000) / 10000;
    return {
      success: true,
      result: rounded,
      formatted: rounded.toLocaleString("en-IN", { maximumFractionDigits: 4 }),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Calculation error";
    return { success: false, error: msg };
  }
}
