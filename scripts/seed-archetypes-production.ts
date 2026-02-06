#!/usr/bin/env bun
/**
 * Seed de arquetipos descubiertos por Claude para producción.
 *
 * Uso:
 *   bun run scripts/seed-archetypes-production.ts
 */

import { db } from '~/db';
import { manualArchetypes } from '~/db/schema';
import archetypeData from '../claude_exhaustive_archetypes.json';

async function seedArchetypes() {
  console.log('='.repeat(80));
  console.log('📦 SEEDING ARQUETIPOS A BASE DE DATOS');
  console.log('='.repeat(80));

  const arquetipos = archetypeData.archetipos;

  console.log(`\n📋 Arquetipos a importar: ${arquetipos.length}`);

  let inserted = 0;
  let updated = 0;

  for (const arch of arquetipos) {
    try {
      // Verificar si ya existe
      const existing = await db.query.manualArchetypes.findFirst({
        where: (archetypes, { eq }) => eq(archetypes.name, arch.nombre),
      });

      if (existing) {
        // Actualizar
        await db
          .update(manualArchetypes)
          .set({
            description: arch.descripcion,
            keywords: arch.keywords,
            priority: arch.prioridad,
          })
          .where((archetypes) => archetypes.name.eq(arch.nombre));

        updated++;
        console.log(`  ✓ Actualizado: ${arch.nombre}`);
      } else {
        // Insertar nuevo
        await db.insert(manualArchetypes).values({
          name: arch.nombre,
          description: arch.descripcion,
          keywords: arch.keywords,
          priority: arch.prioridad,
          exampleMessageIds: [],
        });

        inserted++;
        console.log(`  ✓ Insertado: ${arch.nombre}`);
      }
    } catch (error) {
      console.error(`  ❌ Error con ${arch.nombre}:`, error);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ SEED COMPLETADO');
  console.log('='.repeat(80));
  console.log(`\n📊 Resumen:`);
  console.log(`  - Nuevos arquetipos: ${inserted}`);
  console.log(`  - Arquetipos actualizados: ${updated}`);
  console.log(`  - Total: ${inserted + updated}`);

  console.log('\n💡 Próximos pasos:');
  console.log('  1. Verifica en Tiger → Arquetipos');
  console.log('  2. Deploy a Vercel');
  console.log('  3. Mensajes nuevos se clasificarán automáticamente');

  process.exit(0);
}

seedArchetypes().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
