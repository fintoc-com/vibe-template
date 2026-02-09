#!/usr/bin/env python3
"""
Análisis EXHAUSTIVO de arquetipos usando Claude con últimos 90 días.

Este script:
1. Carga TODOS los mensajes de últimos 90 días
2. Hace múltiples pasadas con Claude para analizar diferentes aspectos
3. Agrupa por threads para mejor contexto
4. Claude genera arquetipos de alta calidad
5. Exporta arquetipos listos para importar a Tiger

Costo estimado: $2-5 (dependiendo del volumen)
"""

import os
import json
import psycopg2
from dotenv import load_dotenv
import pandas as pd
from anthropic import Anthropic
from datetime import datetime, timedelta
from collections import defaultdict

load_dotenv()

# Configuración
DATABASE_URL = os.getenv('DATABASE_URL')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')

if not ANTHROPIC_API_KEY:
    raise ValueError('ANTHROPIC_API_KEY no encontrada en .env')

conn = psycopg2.connect(DATABASE_URL)
client = Anthropic(api_key=ANTHROPIC_API_KEY)

print('='*80)
print('🧠 ANÁLISIS EXHAUSTIVO DE ARQUETIPOS CON CLAUDE')
print('='*80)

# PASO 1: Verificar datos disponibles
print('\n📊 Paso 1: Verificando datos disponibles...')

cursor = conn.cursor()
cursor.execute("""
    SELECT
        MIN(datetime) as oldest,
        MAX(datetime) as newest,
        COUNT(*) as total
    FROM slack_messages
    WHERE archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
""")
oldest, newest, total = cursor.fetchone()
cursor.close()

print(f'✓ Rango de datos: {oldest.strftime("%Y-%m-%d")} → {newest.strftime("%Y-%m-%d")}')
print(f'✓ Total de mensajes: {total:,}')

days_available = (newest - oldest).days
print(f'✓ Días de historia: {days_available}')

if days_available < 90:
    print(f'⚠️  Solo tienes {days_available} días de historia (no llega a 90)')
    days_to_use = days_available
else:
    days_to_use = 90
    print(f'✓ Usando últimos 90 días para el análisis')

# PASO 2: Cargar mensajes de últimos N días
print(f'\n📥 Paso 2: Cargando mensajes de últimos {days_to_use} días...')

cutoff_date = datetime.now() - timedelta(days=days_to_use)

query = """
    SELECT
        id,
        text,
        thread_ts,
        is_thread_reply,
        parent_message_id,
        datetime,
        user_id
    FROM slack_messages
    WHERE
        archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
        AND text IS NOT NULL
        AND text != ''
        AND datetime >= %s
    ORDER BY datetime DESC
"""

df = pd.read_sql_query(query, conn, params=(cutoff_date,))
conn.close()

print(f'✓ Cargados {len(df):,} mensajes')
print(f'  - Mensajes principales: {len(df[df["is_thread_reply"] == False]):,}')
print(f'  - Replies en threads: {len(df[df["is_thread_reply"] == True]):,}')

# PASO 3: Agrupar por threads
print(f'\n🔗 Paso 3: Agrupando por threads...')

threads = defaultdict(list)

for _, row in df.iterrows():
    if row['is_thread_reply'] and row['parent_message_id']:
        thread_key = row['parent_message_id']
    else:
        thread_key = row['id']

    threads[thread_key].append({
        'text': row['text'],
        'datetime': row['datetime'],
        'is_parent': not row['is_thread_reply']
    })

# Crear documentos de threads completos
thread_documents = []
for thread_key, messages in threads.items():
    messages.sort(key=lambda x: x['datetime'])
    thread_text = '\n---\n'.join([msg['text'] for msg in messages])
    thread_documents.append({
        'id': thread_key,
        'text': thread_text,
        'message_count': len(messages),
        'date': messages[0]['datetime']
    })

thread_documents.sort(key=lambda x: x['date'], reverse=True)

print(f'✓ Agrupados en {len(thread_documents):,} threads/conversaciones')
print(f'  - Promedio de mensajes por thread: {len(df) / len(thread_documents):.1f}')

# PASO 4: Seleccionar muestra representativa
print(f'\n📋 Paso 4: Seleccionando muestra estratificada...')

# Tomar muestra que represente todo el periodo
sample_size = min(500, len(thread_documents))

# Dividir en 3 periodos para asegurar representatividad
period_size = sample_size // 3
recent = thread_documents[:period_size]  # Últimos 30 días
middle = thread_documents[len(thread_documents)//3:len(thread_documents)//3 + period_size]  # Días 30-60
older = thread_documents[2*len(thread_documents)//3:2*len(thread_documents)//3 + period_size]  # Días 60-90

sample_threads = recent + middle + older

print(f'✓ Muestra seleccionada: {len(sample_threads)} threads')
print(f'  - Recientes (0-30 días): {len(recent)}')
print(f'  - Medios (30-60 días): {len(middle)}')
print(f'  - Antiguos (60-90 días): {len(older)}')

# PASO 5: Análisis exhaustivo con Claude (múltiples pasadas)
print(f'\n🧠 Paso 5: Análisis exhaustivo con Claude...')
print(f'   Esto tomará 3-5 minutos y costará ~${sample_size * 0.01:.2f}')

# Dividir muestra en batches para análisis
batch_size = 100
batches = [sample_threads[i:i+batch_size] for i in range(0, len(sample_threads), batch_size)]

all_insights = []

for batch_num, batch in enumerate(batches, 1):
    print(f'\n   Analizando batch {batch_num}/{len(batches)} ({len(batch)} threads)...')

    # Preparar corpus
    messages_text = "\n\n===THREAD===\n\n".join([
        f"[Thread {i+1}]\n{thread['text'][:500]}"
        for i, thread in enumerate(batch)
    ])

    # Análisis con Claude
    prompt = f"""Analiza estos {len(batch)} threads de un canal de Slack de soporte técnico/operaciones.

THREADS (batch {batch_num}/{len(batches)}):
{messages_text}

INSTRUCCIONES:
1. Identifica los temas principales y patrones en estos threads
2. Agrúpalos en categorías de alto nivel (arquetipos)
3. Para cada arquetipo identifica:
   - Intención/propósito del usuario
   - Palabras clave características
   - Tipo de problema/solicitud
   - Urgencia típica

IMPORTANTE:
- Enfócate en el PROPÓSITO, no solo en palabras
- Distingue entre tipos de solicitud (ayuda, reporte, consulta, etc.)
- Considera contexto de negocio/operaciones

RESPONDE EN JSON:
{{
  "arquetipos": [
    {{
      "nombre": "Nombre descriptivo",
      "proposito": "Qué intenta lograr el usuario",
      "keywords": ["palabra1", "palabra2", ...],
      "caracteristicas": "Características distintivas",
      "frecuencia_estimada": "alta/media/baja",
      "ejemplos_ids": [1, 3, 5]
    }}
  ],
  "patrones_generales": "Observaciones sobre este batch"
}}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4000,
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

        batch_insights = json.loads(json_text)
        all_insights.append(batch_insights)

        print(f'      ✓ Encontrados {len(batch_insights["arquetipos"])} arquetipos en este batch')

    except Exception as e:
        print(f'      ⚠️  Error en batch {batch_num}: {e}')
        continue

# PASO 6: Consolidar arquetipos de todos los batches
print(f'\n🔄 Paso 6: Consolidando arquetipos de todos los batches...')

# Combinar todos los arquetipos
all_archetypes = []
for insight in all_insights:
    all_archetypes.extend(insight['arquetipos'])

print(f'✓ Arquetipos totales encontrados: {len(all_archetypes)}')

# Consolidar con Claude
print(f'\n   Consolidando con Claude...')

consolidation_prompt = f"""Tienes {len(all_archetypes)} arquetipos descubiertos en múltiples análisis de un canal de Slack.

ARQUETIPOS DESCUBIERTOS:
{json.dumps(all_archetypes, indent=2, ensure_ascii=False)}

TAREA: Consolida estos arquetipos en una taxonomía final de 10-15 arquetipos únicos.

REGLAS:
1. Fusiona arquetipos similares/duplicados
2. Mantén solo los más frecuentes e importantes
3. Asegura que sean mutuamente excluyentes
4. Nombres claros y descriptivos en español
5. Keywords únicas y discriminativas

RESPONDE EN JSON:
{{
  "arquetipos_finales": [
    {{
      "nombre": "Nombre del Arquetipo",
      "descripcion": "Descripción detallada del propósito",
      "keywords": ["keyword1", "keyword2", ...],
      "prioridad": 100,
      "cobertura_estimada": 15,
      "cuando_usar": "Criterios para clasificar un mensaje en este arquetipo"
    }}
  ],
  "justificacion": "Cómo se consolidaron los arquetipos"
}}"""

response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=6000,
    messages=[{"role": "user", "content": consolidation_prompt}]
)

response_text = response.content[0].text

# Extraer JSON
if '```json' in response_text:
    json_start = response_text.find('```json') + 7
    json_end = response_text.find('```', json_start)
    json_text = response_text[json_start:json_end].strip()
else:
    json_text = response_text

final_results = json.loads(json_text)

print(f'✓ Arquetipos finales consolidados: {len(final_results["arquetipos_finales"])}')

# PASO 7: Mostrar resultados
print('\n' + '='*80)
print('🎯 ARQUETIPOS FINALES')
print('='*80)

for i, arch in enumerate(final_results['arquetipos_finales'], 1):
    print(f"\n{i}. {arch['nombre']} (~{arch.get('cobertura_estimada', 'N/A')}%)")
    print(f"   {arch['descripcion']}")
    print(f"   Keywords: {', '.join(arch['keywords'][:8])}")
    print(f"   Cuándo usar: {arch.get('cuando_usar', 'N/A')}")
    print('-'*80)

print(f"\n💡 Justificación de consolidación:")
print(final_results.get('justificacion', 'N/A'))

# PASO 8: Exportar
print('\n📤 Paso 8: Exportando resultados...')

output = {
    'analysis_date': datetime.now().isoformat(),
    'method': 'claude_exhaustive_analysis',
    'period_analyzed': f'last_{days_to_use}_days',
    'total_threads_analyzed': len(sample_threads),
    'total_messages': len(df),
    'date_range': {
        'from': cutoff_date.isoformat(),
        'to': datetime.now().isoformat()
    },
    'archetipos': final_results['arquetipos_finales'],
    'consolidation_notes': final_results.get('justificacion', ''),
    'raw_insights': [insight['patrones_generales'] for insight in all_insights if 'patrones_generales' in insight]
}

output_path = os.path.join(os.path.dirname(__file__), 'claude_exhaustive_archetypes.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f'✓ Arquetipos exportados a: {output_path}')

# PASO 9: Generar archivo listo para importar a Tiger
print('\n📋 Paso 9: Generando archivo para importar a Tiger...')

tiger_import = []
for arch in final_results['arquetipos_finales']:
    tiger_import.append({
        'name': arch['nombre'],
        'description': arch['descripcion'],
        'keywords': arch['keywords'][:10],
        'priority': arch.get('prioridad', 100),
        'notes': arch.get('cuando_usar', '')
    })

import_path = os.path.join(os.path.dirname(__file__), 'tiger_import_archetypes.json')
with open(import_path, 'w', encoding='utf-8') as f:
    json.dump(tiger_import, f, indent=2, ensure_ascii=False)

print(f'✓ Archivo de importación generado: {import_path}')

# RESUMEN FINAL
print('\n' + '='*80)
print('✅ ANÁLISIS COMPLETADO')
print('='*80)
print(f'\n📊 Resumen:')
print(f'  - Periodo analizado: últimos {days_to_use} días')
print(f'  - Mensajes totales: {len(df):,}')
print(f'  - Threads analizados: {len(sample_threads):,}')
print(f'  - Arquetipos descubiertos: {len(all_archetypes)}')
print(f'  - Arquetipos finales: {len(final_results["arquetipos_finales"])}')
print(f'  - Costo estimado: ${sample_size * 0.01:.2f}')

print('\n💡 Próximos pasos:')
print('  1. Revisa los arquetipos en: claude_exhaustive_archetypes.json')
print('  2. Importa a Tiger desde: tiger_import_archetypes.json')
print('  3. O crea manualmente en Tiger → Arquetipos')
print('  4. Ejecuta reclasificación de mensajes existentes')
print('  5. Los mensajes nuevos se clasificarán automáticamente')

print('\n✨ Estos arquetipos están listos para producción!')
