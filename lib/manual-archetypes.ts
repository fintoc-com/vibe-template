import { db } from '~/db';
import { manualArchetypes } from '~/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Manual Archetype System
 *
 * User-defined archetypes that take priority over BERT classification.
 * Supports keyword-based matching with custom rules.
 */

export interface ManualArchetype {
  id: number;
  name: string;
  description: string;
  keywords: string[];
  exampleMessageIds?: string[];
  priority: number;
  matcher?: (text: string, lowerText: string) => boolean;
}

/**
 * In-memory cache of manual archetypes
 * Loaded on startup and refreshed when DB changes
 */
let archetypeCache: ManualArchetype[] = [];
let cacheLoaded = false;

/**
 * Load manual archetypes from database
 */
export async function loadManualArchetypes(): Promise<ManualArchetype[]> {
  const archetypes = await db.select().from(manualArchetypes).orderBy(manualArchetypes.priority);

  archetypeCache = archetypes.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    keywords: a.keywords as string[],
    exampleMessageIds: a.exampleMessageIds as string[] | undefined,
    priority: a.priority,
  }));

  cacheLoaded = true;
  return archetypeCache;
}

/**
 * Get cached manual archetypes (loads from DB if not cached)
 */
export async function getManualArchetypes(): Promise<ManualArchetype[]> {
  if (!cacheLoaded) {
    await loadManualArchetypes();
  }
  return archetypeCache;
}

/**
 * Refresh the archetype cache
 */
export function refreshArchetypeCache() {
  cacheLoaded = false;
}

/**
 * Check if text matches a manual archetype
 */
function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();

  for (const keyword of keywords) {
    // Support simple keyword matching and regex patterns
    if (keyword.startsWith('/') && keyword.endsWith('/')) {
      // Regex pattern
      const pattern = keyword.slice(1, -1);
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) return true;
      } catch (e) {
        console.error(`Invalid regex pattern: ${keyword}`, e);
      }
    } else {
      // Simple keyword matching
      if (lower.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detect manual archetype from text
 * Returns null if no manual archetype matches
 */
export async function detectManualArchetype(
  text: string,
): Promise<{
  archetype: string;
  confidence: 'high';
} | null> {
  const archetypes = await getManualArchetypes();

  // Check archetypes in priority order (already sorted)
  for (const archetype of archetypes) {
    // Use custom matcher if defined, otherwise use keyword matching
    const matches = archetype.matcher
      ? archetype.matcher(text, text.toLowerCase())
      : matchesKeywords(text, archetype.keywords);

    if (matches) {
      return {
        archetype: archetype.name,
        confidence: 'high',
      };
    }
  }

  return null;
}

/**
 * Add a new manual archetype
 */
export async function addManualArchetype(params: {
  name: string;
  description: string;
  keywords: string[];
  exampleMessageIds?: string[];
  priority?: number;
}) {
  const [archetype] = await db
    .insert(manualArchetypes)
    .values({
      name: params.name,
      description: params.description,
      keywords: params.keywords as any,
      exampleMessageIds: params.exampleMessageIds as any,
      priority: params.priority ?? 100,
    })
    .returning();

  refreshArchetypeCache();
  return archetype;
}

/**
 * Update an existing manual archetype
 */
export async function updateManualArchetype(
  id: number,
  params: Partial<{
    name: string;
    description: string;
    keywords: string[];
    exampleMessageIds: string[];
    priority: number;
  }>,
) {
  const [archetype] = await db
    .update(manualArchetypes)
    .set({
      ...params,
      keywords: params.keywords as any,
      exampleMessageIds: params.exampleMessageIds as any,
      updatedAt: new Date(),
    })
    .where(eq(manualArchetypes.id, id))
    .returning();

  refreshArchetypeCache();
  return archetype;
}

/**
 * Delete a manual archetype
 */
export async function deleteManualArchetype(id: number) {
  await db.delete(manualArchetypes).where(eq(manualArchetypes.id, id));
  refreshArchetypeCache();
}
