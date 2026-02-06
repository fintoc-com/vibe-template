/**
 * Detects the topic/category of a message based on its content
 */
export function detectTopic(text: string): {
  topic: string
  color: string
} {
  const lower = text.toLowerCase();

  // Refunds / Reembolsos
  if (lower.includes('reembolso') || lower.includes('refund') || lower.includes('devol')) {
    return { topic: 'Reembolsos', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' };
  }

  // Payments / Pagos
  if (lower.includes('pago') || lower.includes('payment') || lower.includes('cobro') || lower.includes('transacci')) {
    return { topic: 'Pagos', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' };
  }

  // Integration / Technical
  if (lower.includes('integra') || lower.includes('api') || lower.includes('sdk') || lower.includes('técnic') || lower.includes('tecnic')) {
    return { topic: 'Integración', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' };
  }

  // Support / Help
  if (lower.includes('ayud') || lower.includes('help') || lower.includes('soporte') || lower.includes('problem') || lower.includes('error')) {
    return { topic: 'Soporte', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
  }

  // Merchants
  if (lower.includes('merchant') || lower.includes('comercio') || lower.includes('tienda')) {
    return { topic: 'Merchants', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' };
  }

  // Account / Configuration
  if (lower.includes('cuenta') || lower.includes('config') || lower.includes('credencial') || lower.includes('access')) {
    return { topic: 'Configuración', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' };
  }

  // General
  return { topic: 'General', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' };
}

/**
 * Generates a short summary/ask from a message
 */
export function generateSummary(text: string): string {
  const lower = text.toLowerCase();

  // Remove mentions and links for cleaner analysis
  let cleaned = text.replace(/@\w+/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.trim();

  // Extract first sentence or main action
  const sentences = cleaned.split(/[.!?]\s+/);
  let firstSentence = sentences[0] || cleaned;

  // Limit length
  if (firstSentence.length > 80) {
    firstSentence = firstSentence.substring(0, 77) + '...';
  }

  // Detect common patterns and simplify
  if (lower.includes('cancel') && lower.includes('reembolso')) {
    return 'Solicitud de cancelación de reembolso';
  }
  if (lower.includes('ayud') || lower.includes('help')) {
    return 'Solicitud de ayuda';
  }
  if (lower.includes('error') || lower.includes('falla')) {
    return 'Reporte de error';
  }
  if (lower.includes('gracias') || lower.includes('thank')) {
    return 'Agradecimiento';
  }

  return firstSentence || 'Mensaje';
}

/**
 * Extracts all user IDs mentioned in a message text
 */
export function extractUserIdsFromText(text: string): string[] {
  const userIdPattern = /<@([A-Z0-9]+)>/g;
  const matches = text.matchAll(userIdPattern);
  return Array.from(matches, (m) => m[1]);
}

/**
 * Gets a color for a category group
 */
export function getCategoryColor(category: string): string {
  switch (category) {
    case 'Soporte': return 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950';
    case 'KAMs': return 'border-l-4 border-green-500 bg-green-50 dark:bg-green-950';
    case 'Merchants Kushki': return 'border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950';
    case 'Bots': return 'border-l-4 border-gray-500 bg-gray-50 dark:bg-gray-950';
    default: return 'border-l-4 border-zinc-500 bg-zinc-50 dark:bg-zinc-950';
  }
}
