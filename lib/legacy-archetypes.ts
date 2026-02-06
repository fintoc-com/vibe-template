/**
 * LEGACY ARCHETYPE DETECTION SYSTEM
 *
 * This was the original keyword-based archetype detection system.
 * Preserved for reference and potential fallback.
 *
 * Replaced by BERTopic-based machine learning classification.
 * Date archived: 2026-02-03
 */

export function detectArchetypeLegacy(
  text: string,
  user?: { name: string, isBot: boolean },
  messageType?: 'reminder' | 'bot' | 'user',
): {
  archetype: string
  confidence: 'high' | 'medium' | 'low'
} {
  const lower = text.toLowerCase();

  // Fixed archetypes - these are automatically generated and not interesting
  // Reminder messages (from Slackbot or reminder system)
  if (messageType === 'reminder' || lower.includes('reminder:')) {
    return { archetype: 'Reminder (Automático)', confidence: 'high' };
  }

  // RoboCops bot messages
  if (user?.isBot && user.name.toLowerCase().includes('robocops')) {
    return { archetype: 'RoboCops (Bot)', confidence: 'high' };
  }

  // Recipient Account issues
  if (lower.includes('recipient account') || lower.includes('cuenta receptora') || lower.includes('recipient_account')) {
    return { archetype: 'Recipient Account', confidence: 'high' };
  }

  // Cancelación de reembolso
  if ((lower.includes('cancel') || lower.includes('cancelar')) && lower.includes('reembolso')) {
    return { archetype: 'Cancelación de Reembolso', confidence: 'high' };
  }

  // Solicitud de reembolso
  if (lower.includes('reembolso') || lower.includes('refund')) {
    return { archetype: 'Solicitud de Reembolso', confidence: 'high' };
  }

  // Error de integración
  if ((lower.includes('error') || lower.includes('falla')) && (lower.includes('integra') || lower.includes('api'))) {
    return { archetype: 'Error de Integración', confidence: 'high' };
  }

  // Problema con pago
  if ((lower.includes('error') || lower.includes('problem') || lower.includes('falla')) && (lower.includes('pago') || lower.includes('payment'))) {
    return { archetype: 'Error en Pago', confidence: 'high' };
  }

  // Consulta sobre credenciales
  if (lower.includes('credencial') || lower.includes('access') || lower.includes('token') || lower.includes('api key')) {
    return { archetype: 'Consulta de Credenciales', confidence: 'high' };
  }

  // Problema con merchant/comercio
  if ((lower.includes('merchant') || lower.includes('comercio')) && (lower.includes('problem') || lower.includes('error') || lower.includes('ayud'))) {
    return { archetype: 'Problema de Merchant', confidence: 'high' };
  }

  // Solicitud de configuración
  if (lower.includes('config') || lower.includes('setup') || lower.includes('activar') || lower.includes('habilitar')) {
    return { archetype: 'Solicitud de Configuración', confidence: 'high' };
  }

  // Consulta técnica
  if (lower.includes('cómo') || lower.includes('como') || lower.includes('how')) {
    return { archetype: 'Consulta Técnica', confidence: 'medium' };
  }

  // Agradecimiento
  if (lower.includes('gracias') || lower.includes('thank')) {
    return { archetype: 'Agradecimiento', confidence: 'high' };
  }

  // Solicitud de ayuda general
  if (lower.includes('ayud') || lower.includes('help') || lower.includes('soporte')) {
    return { archetype: 'Solicitud de Ayuda', confidence: 'medium' };
  }

  // Escalamiento
  if (lower.includes('urgent') || lower.includes('urgente') || lower.includes('priorit')) {
    return { archetype: 'Escalamiento Urgente', confidence: 'high' };
  }

  // Notificación de bot
  if (lower.includes('reminder') || lower.includes('recordatorio') || lower.includes('notification')) {
    return { archetype: 'Notificación Automática', confidence: 'high' };
  }

  // Si no calza con ningún patrón
  return { archetype: 'Sin Asignar', confidence: 'low' };
}
