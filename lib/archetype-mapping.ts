/**
 * BERTopic Archetype Mapping
 *
 * Maps topic IDs discovered by BERTopic to human-readable archetype names.
 * Generated from analysis on 2026-02-03 of 495 parent messages.
 */

export interface ArchetypeMapping {
  id: number;
  name: string;
  description: string;
  keywords: string[];
  messageCount: number;
}

export const ARCHETYPE_MAPPINGS: ArchetypeMapping[] = [
  {
    id: 0,
    name: 'Tareas Operacionales Generales',
    description: 'Recordatorios y tareas operativas generales: actualizaciones de pagos, descargas de nóminas, cancelaciones de reembolsos',
    keywords: ['reminder', 'login', 'notion', 'descargar', 'actualización', 'pago'],
    messageCount: 147,
  },
  {
    id: 1,
    name: 'Alertas de Disponibilidad Bancaria',
    description: 'Notificaciones sobre configuraciones de availability_percentage != 100 en product_configs',
    keywords: ['product_configs', 'availability_percentage', 'bancos', 'chile'],
    messageCount: 71,
  },
  {
    id: 2,
    name: 'Transferencias Estado-Security',
    description: 'Recordatorios para mover fondos entre Banco Estado y Banco Security',
    keywords: ['security', 'banco', 'estado', 'plata', 'mover', 'minas'],
    messageCount: 30,
  },
  {
    id: 3,
    name: 'Onboarding Merchants Kushki',
    description: 'Solicitudes para subir nuevos merchants a la plataforma de Kushki',
    keywords: ['kushki', 'merchant', 'subir', 'plataforma', 'google', 'docs'],
    messageCount: 28,
  },
  {
    id: 4,
    name: 'Dashboard Ops Collection',
    description: 'Tareas relacionadas con el dashboard de Ops Collection en Retool',
    keywords: ['collection', 'ops', 'dashboard', 'daily', 'tasks', 'retool'],
    messageCount: 27,
  },
  {
    id: 5,
    name: 'Advertencias Bank Statements BICE',
    description: 'Alertas sobre archivos faltantes de bank statements de BICE',
    keywords: ['statement', 'files', 'warning', 'bice', 'missing', 'gcp'],
    messageCount: 27,
  },
  {
    id: 6,
    name: 'Gestión de Contracargos',
    description: 'Solicitudes para ingresar información de contracargos (chargebacks) en Kushki',
    keywords: ['chargebacks', 'contracargo', 'información', 'kushki', 'ingresar'],
    messageCount: 24,
  },
  {
    id: 7,
    name: 'Proceso Nómina Unired',
    description: 'Recordatorios para ejecutar el proceso de nómina de Unired',
    keywords: ['unired', 'nómina', 'proceso', 'subir', 'mina'],
    messageCount: 23,
  },
  {
    id: 8,
    name: 'Refresh Cuentas BICE',
    description: 'Recordatorios para ejecutar el proceso de refresh de cuentas BICE',
    keywords: ['refresh', 'cuentas', 'bice', 'proceso'],
    messageCount: 23,
  },
  {
    id: 9,
    name: 'Subida Universo BancoChile',
    description: 'Recordatorios para subir el universo al portal de recaudación PAC de BancoChile',
    keywords: ['universo', 'bancochile', 'pac', 'recaudacion', 'portal'],
    messageCount: 22,
  },
  {
    id: 10,
    name: 'Documentos Card Payout',
    description: 'Alertas sobre orgs con Cards activo sin documento card_payout_details',
    keywords: ['documento', 'card_payout_details', 'formulario', 'orgs', 'cards'],
    messageCount: 17,
  },
  {
    id: 11,
    name: 'Reintentos Refund Disbursal',
    description: 'Alertas de refunds con failed disbursal que necesitan retry',
    keywords: ['retry', 'refund', 'disbursal', 'failed', 'alarm'],
    messageCount: 12,
  },
  {
    id: 12,
    name: 'Reacciones y Emojis',
    description: 'Mensajes que solo contienen emojis o reacciones breves',
    keywords: ['emoji', 'freezer', 'melt', 'bombardino'],
    messageCount: 10,
  },
  {
    id: 13,
    name: 'Estado Lock de Bancos',
    description: 'Alertas sobre bancos con lock=true que necesitan revisión',
    keywords: ['lock', 'bancos', 'true', 'disponibles', 'retool'],
    messageCount: 5,
  },
];

// Special fixed archetypes that don't go through clustering
export const FIXED_ARCHETYPES = {
  REMINDER: 'Reminder (Automático)',
  ROBOCOPS: 'RoboCops (Bot)',
  THREAD_REPLY: 'Thread Reply',
} as const;

/**
 * Get archetype name by topic ID
 */
export function getArchetypeName(topicId: number): string {
  const mapping = ARCHETYPE_MAPPINGS.find((m) => m.id === topicId);
  return mapping?.name || 'Sin Clasificar';
}

/**
 * Get archetype description by topic ID
 */
export function getArchetypeDescription(topicId: number): string | undefined {
  const mapping = ARCHETYPE_MAPPINGS.find((m) => m.id === topicId);
  return mapping?.description;
}

/**
 * Get all archetype names
 */
export function getAllArchetypeNames(): string[] {
  return ARCHETYPE_MAPPINGS.map((m) => m.name);
}
