#!/usr/bin/env python3
"""
Clasifica TODOS los mensajes existentes usando los arquetipos de Claude.

Este script:
1. Lee arquetipos desde claude_exhaustive_archetypes.json
2. Clasifica cada mensaje usando Claude Sonnet 4.5
3. Actualiza la base de datos con las clasificaciones
4. Genera reporte de distribución final

Costo estimado: ~$1-3 (dependiendo del volumen)
"""

import os
import json
import psycopg2
from dotenv import load_dotenv
from anthropic import Anthropic
import time

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')

if not ANTHROPIC_API_KEY:
    raise ValueError('ANTHROPIC_API_KEY no encontrada en .env')

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()
client = Anthropic(api_key=ANTHROPIC_API_KEY)

print('='*80)
print('🔍 CLASIFICACIÓN DE MENSAJES CON ARQUETIPOS DE CLAUDE')
print('='*80)

# Cargar arquetipos
print('\n📋 Cargando arquetipos...')
archetype_path = os.path.join(os.path.dirname(__file__), 'claude_exhaustive_archetypes.json')
with open(archetype_path, 'r', encoding='utf-8') as f:
    archetype_data = json.load(f)

arquetipos = archetype_data['archetipos']  # Note: 'archetipos' in JSON
print(f'✓ Cargados {len(arquetipos)} arquetipos')

# Preparar descripción de arquetipos para Claude
arquetipos_descripcion = ""
for i, arch in enumerate(arquetipos, 1):
    arquetipos_descripcion += f"{i}. {arch['nombre']}\n"
    arquetipos_descripcion += f"   {arch['descripcion']}\n"
    arquetipos_descripcion += f"   Keywords: {', '.join(arch['keywords'][:8])}\n"
    arquetipos_descripcion += f"   Cuándo usar: {arch['cuando_usar']}\n\n"

# Obtener TODOS los mensajes a clasificar (sin excepciones)
print('\n📥 Cargando mensajes a clasificar...')
cursor.execute("""
    SELECT id, text
    FROM slack_messages
    WHERE is_thread_reply = false
    ORDER BY datetime DESC
""")

messages = cursor.fetchall()
print(f'✓ {len(messages)} mensajes principales a clasificar')

# Clasificar en batches
print(f'\n🤖 Clasificando con Claude Sonnet 4.5...')
batch_size = 50
batches = [messages[i:i+batch_size] for i in range(0, len(messages), batch_size)]

classified_count = 0
failed_count = 0

for batch_num, batch in enumerate(batches, 1):
    print(f'\n   Batch {batch_num}/{len(batches)} ({len(batch)} mensajes)...', end=' ')

    # Preparar mensajes para clasificación
    messages_text = ""
    for i, (msg_id, msg_text) in enumerate(batch):
        messages_text += f"[{i}] {msg_text[:300]}\n\n"

    # Clasificar con Claude
    prompt = f"""Clasifica estos {len(batch)} mensajes de Slack en los arquetipos apropiados.

ARQUETIPOS DISPONIBLES:
{arquetipos_descripcion}

ARQUETIPOS ESPECIALES (puedes usar sub-arquetipos si detectas diferencias claras):
- Para reminders automáticos de Slack, puedes usar sub-arquetipos específicos si hay diferencias temáticas
- Para mensajes del bot RoboCop, puedes dividir por tipo de alerta si tiene sentido
- Para mensajes de usuarios específicos (como Jared), puedes crear sub-arquetipos por temática

MENSAJES A CLASIFICAR:
{messages_text}

INSTRUCCIONES:
1. Para cada mensaje, asigna el arquetipo más apropiado de la lista
2. Si es un reminder/RoboCop/usuario específico pero cabe mejor en un arquetipo de negocio específico, úsalo
3. Si NO encaja en ningún arquetipo, asigna "Sin Clasificar"
4. Sé específico: cada arquetipo tiene "cuando_usar" claro

RESPONDE EN JSON:
{{
  "clasificaciones": [
    {{"indice": 0, "arquetipo": "Nombre Exacto del Arquetipo"}},
    {{"indice": 1, "arquetipo": "Otro Arquetipo"}},
    ...
  ]
}}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text

        # Extraer JSON
        if '```json' in response_text:
            json_start = response_text.find('```json') + 7
            json_end = response_text.find('```', json_start)
            json_text = response_text[json_start:json_end].strip()
        else:
            json_text = response_text

        result = json.loads(json_text)

        # Actualizar base de datos
        for clasificacion in result['clasificaciones']:
            idx = clasificacion['indice']
            arquetipo = clasificacion['arquetipo']
            msg_id, _ = batch[idx]

            cursor.execute("""
                UPDATE slack_messages
                SET archetype = %s,
                    archetype_confidence = 'claude_exhaustive',
                    updated_at = NOW()
                WHERE id = %s
            """, (arquetipo, msg_id))

            classified_count += 1

        conn.commit()
        print(f'✓ {len(batch)} clasificados')

    except Exception as e:
        print(f'❌ Error: {e}')
        failed_count += len(batch)
        conn.rollback()
        continue

    time.sleep(1)  # Rate limiting

# Resumen final
print('\n' + '='*80)
print('✅ CLASIFICACIÓN COMPLETADA')
print('='*80)
print(f'\n📊 Resumen:')
print(f'  - Mensajes clasificados: {classified_count}')
print(f'  - Mensajes fallidos: {failed_count}')

# Distribución de arquetipos
print('\n📈 Distribución de arquetipos en mensajes principales:')
cursor.execute("""
    SELECT archetype, COUNT(*) as count
    FROM slack_messages
    WHERE is_thread_reply = false
    GROUP BY archetype
    ORDER BY count DESC
""")

for archetype, count in cursor.fetchall():
    print(f'  - {archetype}: {count}')

# Cleanup
cursor.close()
conn.close()

print('\n💡 Próximos pasos:')
print('  1. Los mensajes están clasificados en la DB')
print('  2. Ejecuta seed de arquetipos para producción:')
print('     bun run db:seed-archetypes')
print('  3. Deploy a Vercel')
print('  4. Los mensajes nuevos se clasificarán automáticamente')
