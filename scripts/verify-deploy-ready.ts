#!/usr/bin/env bun

/**
 * Pre-deployment verification script
 * Checks if the project is ready for production deployment
 */

import { db } from '~/db';
import { manualArchetypes, slackMessages } from '~/db/schema';
import { sql } from 'drizzle-orm';

console.log('🔍 VERIFICACIÓN PRE-DEPLOY\n');
console.log('='.repeat(50));

let errors = 0;
let warnings = 0;

// 1. Check database connection
console.log('\n📊 1. Verificando conexión a base de datos...');
try {
  await db.execute(sql`SELECT 1`);
  console.log('   ✅ Conexión exitosa');
} catch (error) {
  console.error('   ❌ Error de conexión:', error);
  errors++;
}

// 2. Check archetypes
console.log('\n🏷️  2. Verificando arquetipos...');
try {
  const archetypes = await db.select().from(manualArchetypes);
  if (archetypes.length === 0) {
    console.error('   ❌ No hay arquetipos en la base de datos');
    console.log('   💡 Ejecuta: bun run scripts/seed-archetypes-production.ts');
    errors++;
  } else if (archetypes.length < 15) {
    console.warn(`   ⚠️  Solo ${archetypes.length} arquetipos (se esperan 15)`);
    warnings++;
  } else {
    console.log(`   ✅ ${archetypes.length} arquetipos encontrados`);
  }
} catch (error) {
  console.error('   ❌ Error al verificar arquetipos:', error);
  errors++;
}

// 3. Check messages
console.log('\n💬 3. Verificando mensajes...');
try {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN archetype = 'Sin Clasificar' THEN 1 END) as sin_clasificar
    FROM slack_messages
    WHERE is_thread_reply = false
  `);

  const row = result.rows[0] as { total: string; sin_clasificar: string };
  const total = parseInt(row.total);
  const sinClasificar = parseInt(row.sin_clasificar);

  if (total === 0) {
    console.warn('   ⚠️  No hay mensajes en la base de datos');
    warnings++;
  } else {
    console.log(`   ✅ ${total} mensajes totales`);
    if (sinClasificar > 0) {
      const percent = ((sinClasificar / total) * 100).toFixed(1);
      console.warn(`   ⚠️  ${sinClasificar} mensajes sin clasificar (${percent}%)`);
      warnings++;
    }
  }
} catch (error) {
  console.error('   ❌ Error al verificar mensajes:', error);
  errors++;
}

// 4. Check environment variables
console.log('\n🔐 4. Verificando variables de entorno...');
const requiredEnvVars = [
  'DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_CHANNEL_ID',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`   ❌ ${envVar} no está configurada`);
    errors++;
  } else {
    // Check if it's a production URL for BETTER_AUTH_URL
    if (envVar === 'BETTER_AUTH_URL' && process.env[envVar]?.includes('localhost')) {
      console.warn(`   ⚠️  ${envVar} apunta a localhost (cambiar en producción)`);
      warnings++;
    } else {
      console.log(`   ✅ ${envVar} configurada`);
    }
  }
}

// 5. Check for pending migrations
console.log('\n📦 5. Verificando migraciones...');
try {
  // This is a simple check - in production you'd want to check drizzle migrations table
  console.log('   ℹ️  Verifica manualmente que todas las migraciones están aplicadas');
  console.log('   💡 Ejecuta: bun run db:migrate');
} catch (error) {
  console.error('   ❌ Error al verificar migraciones:', error);
  errors++;
}

// 6. Check GitHub configuration
console.log('\n🐙 6. Verificando configuración de GitHub...');
const fs = await import('fs');

if (fs.existsSync('.github/CODEOWNERS')) {
  console.log('   ✅ CODEOWNERS configurado');
} else {
  console.error('   ❌ Falta archivo .github/CODEOWNERS');
  errors++;
}

if (fs.existsSync('.github/pull_request_template.md')) {
  console.log('   ✅ PR template configurado');
} else {
  console.warn('   ⚠️  Falta PR template');
  warnings++;
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMEN\n');

if (errors === 0 && warnings === 0) {
  console.log('✅ ¡Todo listo para deploy!');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Configurar branch protections en GitHub');
  console.log('   2. Crear proyecto en Vercel');
  console.log('   3. Configurar env vars en Vercel');
  console.log('   4. Deploy!');
  process.exit(0);
} else {
  if (errors > 0) {
    console.log(`❌ ${errors} error(es) crítico(s) encontrado(s)`);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} advertencia(s) encontrada(s)`);
  }
  console.log('\n📋 Revisa los errores arriba antes de deployar.');
  console.log('📖 Lee DEPLOY_CHECKLIST.md para más detalles.');
  process.exit(errors > 0 ? 1 : 0);
}
