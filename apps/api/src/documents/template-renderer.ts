import { createHash } from 'node:crypto';

/**
 * Deterministic, versioned template rendering (card #6.7, DB-independent core). Packs supply templates
 * (see Pack Contract `documents`); the core renders them with data. Rendering is intentionally NOT a
 * scripting language — only `{{ dotted.path }}` interpolation — matching the "no embedded scripting"
 * principle. Same template + same data → same output; the template version is a stable hash of its body,
 * so a regeneration records exactly which template produced a document.
 */

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export class TemplateError extends Error {}

/** Stable version id for a template body (same body → same version). */
export function templateVersion(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16);
}

function resolvePath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

/** Render `body`, substituting every `{{ path }}`. A missing/invalid placeholder is a hard error. */
export function renderTemplate(body: string, data: Record<string, unknown>): string {
  return body.replace(PLACEHOLDER, (_match, path: string) => {
    const value = resolvePath(data, path);
    if (value === undefined || value === null) {
      throw new TemplateError(`Missing template variable: "${path}"`);
    }
    if (typeof value === 'object') {
      throw new TemplateError(`Template variable "${path}" is not a scalar`);
    }
    return String(value);
  });
}

export interface RenderedDocument {
  content: string;
  templateRef: string;
  templateVersion: string;
}

/** Render a named template body into a document payload (content + the version that produced it). */
export function renderDocument(
  templateRef: string,
  body: string,
  data: Record<string, unknown>,
): RenderedDocument {
  return {
    content: renderTemplate(body, data),
    templateRef,
    templateVersion: templateVersion(body),
  };
}
