/**
 * Robust JSON extraction and parsing utilities for LLM outputs and web-scraped JSON-LD.
 * Prevents "unexpected token in valid JSON" errors caused by conversational preambles,
 * markdown fences, trailing commas, comments, and unescaped characters.
 */

export function cleanJsonString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim();

  // 1. Remove markdown code block wrappers if present anywhere
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  }

  // 2. Locate first JSON boundary: '{' or '['
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    text = text.substring(startIdx, endIdx + 1);
  }

  return text;
}

/**
 * Repairs common LLM JSON syntax mistakes:
 * - Trailing commas before closing braces/brackets (e.g., [1, 2, ] or {"a": 1,})
 * - Comments (// or /* *\/)
 */
export function repairJsonString(jsonStr: string): string {
  let cleaned = jsonStr;

  // Remove single line comments (careful not to strip http:// or https://)
  cleaned = cleaned.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1');

  // Remove multiline comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // Remove control characters (except newline, carriage return, tab)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return cleaned;
}

/**
 * Safely parses JSON with multi-stage recovery.
 * Never throws uncaught "Unexpected token" errors when a fallback is provided.
 */
export function safeJsonParse<T>(rawText: string, fallback?: T): T {
  if (!rawText || typeof rawText !== 'string') {
    if (fallback !== undefined) return fallback;
    throw new Error('safeJsonParse: Input text is empty or not a string.');
  }

  const cleaned = cleanJsonString(rawText);

  // Attempt 1: Direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch (_err1) {
    // Attempt 2: Repaired parse
    try {
      const repaired = repairJsonString(cleaned);
      return JSON.parse(repaired) as T;
    } catch (err2) {
      if (fallback !== undefined) {
        console.warn('[JSONUtils] JSON parsing failed, using fallback:', err2 instanceof Error ? err2.message : err2);
        return fallback;
      }
      throw new Error(`Failed to parse JSON: ${err2 instanceof Error ? err2.message : String(err2)}\nRaw snippet: ${cleaned.slice(0, 160)}...`);
    }
  }
}
