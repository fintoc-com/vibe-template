#!/usr/bin/env bun
import { db } from '../db';
import { manualArchetypes } from '../db/schema';
import * as fs from 'fs';

/**
 * Seed archetypes from JSON file
 * Usage: bun run scripts/seed-archetypes.ts archetypes.json
 */

const filename = process.argv[2];

if (!filename) {
  console.error('Usage: bun run scripts/seed-archetypes.ts <archetypes.json>');
  process.exit(1);
}

if (!fs.existsSync(filename)) {
  console.error(`File not found: ${filename}`);
  process.exit(1);
}

interface ArchetypeInput {
  name: string;
  description: string;
  keywords: string[];
  priority?: number;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(filename, 'utf-8')) as ArchetypeInput[];

  console.log(`Loading ${data.length} archetypes from ${filename}...`);

  for (const archetype of data) {
    console.log(`  - ${archetype.name}`);

    await db.insert(manualArchetypes).values({
      name: archetype.name,
      description: archetype.description,
      keywords: archetype.keywords,
      priority: archetype.priority || 100,
    });
  }

  console.log(`✅ Successfully seeded ${data.length} archetypes`);
}

main().catch((error) => {
  console.error('Error seeding archetypes:', error);
  process.exit(1);
});
