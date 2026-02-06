import { execSync } from 'node:child_process';
import path from 'node:path';
import { FIXED_ARCHETYPES, getArchetypeName } from './archetype-mapping';
import { detectManualArchetype } from './manual-archetypes';

/**
 * Detects message archetypes using a hybrid approach:
 * 1. Fixed archetypes (Reminder, RoboCops)
 * 2. Manual user-defined archetypes (keyword-based with priority)
 * 3. BERTopic machine learning classification
 *
 * This prioritization ensures user corrections and custom rules take precedence
 * over automatic ML classification.
 */
export async function detectArchetype(
  text: string,
  user?: { name: string, isBot: boolean },
  messageType?: 'reminder' | 'bot' | 'user',
): Promise<{
  archetype: string
  confidence: 'high' | 'medium' | 'low'
}> {
  const lower = text.toLowerCase();

  // PRIORITY 1: Fixed archetypes - these bypass all other classification
  // Reminder messages (from Slackbot or reminder system)
  if (messageType === 'reminder' || lower.includes('reminder:')) {
    return { archetype: FIXED_ARCHETYPES.REMINDER, confidence: 'high' };
  }

  // RoboCops bot messages
  if (user?.isBot && user.name.toLowerCase().includes('robocops')) {
    return { archetype: FIXED_ARCHETYPES.ROBOCOPS, confidence: 'high' };
  }

  // PRIORITY 2: Manual user-defined archetypes
  // These are custom rules created by users and should override BERT
  try {
    const manualMatch = await detectManualArchetype(text);
    if (manualMatch) {
      return manualMatch;
    }
  } catch (error) {
    console.error('Failed to check manual archetypes:', error);
    // Continue to BERT classification
  }

  // PRIORITY 3: BERTopic classification for everything else
  try {
    const scriptPath = path.join(process.cwd(), 'classify_message.py');
    // Escape text for shell - replace quotes and backslashes
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const result = execSync(`python3 "${scriptPath}" "${escapedText}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 5000, // 5 second timeout
    });

    const classification = JSON.parse(result);

    if (classification.error) {
      console.error('BERTopic classification error:', classification.error);
      return { archetype: 'Sin Clasificar', confidence: 'low' };
    }

    const topicId = classification.topic_id;
    const confidence = classification.confidence;

    // Map topic ID to archetype name
    const archetypeName = getArchetypeName(topicId);

    return {
      archetype: archetypeName,
      confidence: confidence as 'high' | 'medium' | 'low',
    };
  } catch (error) {
    console.error('Failed to classify message with BERTopic:', error);
    // Fallback to unclassified
    return { archetype: 'Sin Clasificar', confidence: 'low' };
  }
}

/**
 * Synchronous version of detectArchetype for backwards compatibility
 * NOTE: This will NOT check manual archetypes and goes directly to BERT
 * Use the async version when possible
 */
export function detectArchetypeSync(
  text: string,
  user?: { name: string, isBot: boolean },
  messageType?: 'reminder' | 'bot' | 'user',
): {
  archetype: string
  confidence: 'high' | 'medium' | 'low'
} {
  const lower = text.toLowerCase();

  // Fixed archetypes
  if (messageType === 'reminder' || lower.includes('reminder:')) {
    return { archetype: FIXED_ARCHETYPES.REMINDER, confidence: 'high' };
  }

  if (user?.isBot && user.name.toLowerCase().includes('robocops')) {
    return { archetype: FIXED_ARCHETYPES.ROBOCOPS, confidence: 'high' };
  }

  // Use BERTopic classification
  try {
    const scriptPath = path.join(process.cwd(), 'classify_message.py');
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const result = execSync(`python3 "${scriptPath}" "${escapedText}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5000,
    });

    const classification = JSON.parse(result);

    if (classification.error) {
      console.error('BERTopic classification error:', classification.error);
      return { archetype: 'Sin Clasificar', confidence: 'low' };
    }

    const topicId = classification.topic_id;
    const confidence = classification.confidence;
    const archetypeName = getArchetypeName(topicId);

    return {
      archetype: archetypeName,
      confidence: confidence as 'high' | 'medium' | 'low',
    };
  } catch (error) {
    console.error('Failed to classify message with BERTopic:', error);
    return { archetype: 'Sin Clasificar', confidence: 'low' };
  }
}

/**
 * Groups messages by archetype
 */
export function groupByArchetype(messages: Array<{
  id: string
  text: string
  datetime: string | null
  user: { name: string, isBot: boolean }
  category: { group: string }
  topic: { topic: string, color: string }
  summary: string
  archetype: { archetype: string, confidence: string }
}>) {
  const archetypes = new Map<string, typeof messages>();

  for (const msg of messages) {
    const archetype = msg.archetype.archetype;
    if (!archetypes.has(archetype)) {
      archetypes.set(archetype, []);
    }
    archetypes.get(archetype)!.push(msg);
  }

  // Sort archetypes by count (descending)
  return new Map(
    Array.from(archetypes.entries())
      .sort(([, a], [, b]) => b.length - a.length),
  );
}
