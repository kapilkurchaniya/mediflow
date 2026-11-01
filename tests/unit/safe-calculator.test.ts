import { describe, it, expect } from "vitest";
import { evaluateMathExpression } from "@/lib/safe-calculator";

describe("evaluateMathExpression", () => {
  it("evaluates simple addition, subtraction, multiplication, and division", () => {
    expect(evaluateMathExpression("10 + 20").result).toBe(30);
    expect(evaluateMathExpression("50 - 15").result).toBe(35);
    expect(evaluateMathExpression("12 * 8").result).toBe(96);
    expect(evaluateMathExpression("100 / 4").result).toBe(25);
  });

  it("handles operator precedence correctly (BODMAS)", () => {
    // Multiplication before addition
    expect(evaluateMathExpression("10 + 5 * 2").result).toBe(20);
    // Division before subtraction
    expect(evaluateMathExpression("100 - 20 / 4").result).toBe(95);
  });

  it("handles parentheses correctly", () => {
    expect(evaluateMathExpression("(10 + 5) * 2").result).toBe(30);
    expect(evaluateMathExpression("2 * (3 + (4 * 5))").result).toBe(46);
  });

  it("handles decimal numbers and eliminates float point artifacts", () => {
    expect(evaluateMathExpression("0.1 + 0.2").result).toBe(0.3);
    expect(evaluateMathExpression("12.50 * 3").result).toBe(37.5);
  });

  it("handles unary minus at start and inside parentheses", () => {
    expect(evaluateMathExpression("-10 + 25").result).toBe(15);
    expect(evaluateMathExpression("50 + (-10)").result).toBe(40);
  });

  it("evaluates retail pharmacy percentages accurately", () => {
    // 100 - 10% discount = 90
    expect(evaluateMathExpression("100 - 10%").result).toBe(90);
    // 500 + 18% GST = 590
    expect(evaluateMathExpression("500 + 18%").result).toBe(590);
    // 250 + 18% = 295
    expect(evaluateMathExpression("250 + 18%").result).toBe(295);
    // 250 - 18% = 205
    expect(evaluateMathExpression("250 - 18%").result).toBe(205);
    // 200 * 5% = 10
    expect(evaluateMathExpression("200 * 5%").result).toBe(10);
    // 500 / 50% = 1000
    expect(evaluateMathExpression("500 / 50%").result).toBe(1000);
    // 100 / 10% = 1000
    expect(evaluateMathExpression("100 / 10%").result).toBe(1000);
    // Standalone 25% = 0.25
    expect(evaluateMathExpression("25%").result).toBe(0.25);
  });

  it("handles 'x' or 'X' as multiplication operator", () => {
    expect(evaluateMathExpression("15 x 4").result).toBe(60);
    expect(evaluateMathExpression("20 X 5").result).toBe(100);
  });

  it("handles whitespace and empty strings gracefully", () => {
    expect(evaluateMathExpression("").result).toBe(0);
    expect(evaluateMathExpression("   ").result).toBe(0);
    expect(evaluateMathExpression("  10   +   20  ").result).toBe(30);
  });

  it("fails safely on division by zero", () => {
    const res = evaluateMathExpression("10 / 0");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Division by zero");
  });

  it("fails safely on mismatched parentheses or malformed expressions", () => {
    expect(evaluateMathExpression("(10 + 20").success).toBe(false);
    expect(evaluateMathExpression("10 + 20)").success).toBe(false);
    expect(evaluateMathExpression("10 + + 20").success).toBe(false);
    expect(evaluateMathExpression("10 +").success).toBe(false);
    expect(evaluateMathExpression("10%%").success).toBe(false);
    expect(evaluateMathExpression("10%+").success).toBe(false);
    expect(evaluateMathExpression("10+%").success).toBe(false);
    expect(evaluateMathExpression("10*/2").success).toBe(false);
  });

  it("rejects unauthorized characters without code execution", () => {
    expect(evaluateMathExpression("alert(1)").success).toBe(false);
    expect(evaluateMathExpression("console.log()").success).toBe(false);
    expect(evaluateMathExpression("10 + abc").success).toBe(false);
  });
});
