#!/usr/bin/env python3
"""
Usa Claude para analizar y mejorar arquetipos.

Este script:
1. Toma una muestra de mensajes
2. Usa Claude para identificar patrones y temas comunes
3. Claude sugiere arquetipos basados en el contenido real
4. Genera un análisis de calidad de los arquetipos actuales
"""

import os
import json
import psycopg2
from dotenv import load_dotenv
import pandas as pd
from anthropic import Anthropic

load_dotenv()

# Conectar a DB
DATABASE_URL = os.getenv('DATABASE_URL')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')

if not ANTHROPIC_API_KEY:
    raise ValueError('ANTHROPIC_API_KEY no encontrada en .env')

conn = psycopg2.connect(DATABASE_URL)
client = Anthropic(api_key=ANTHROPIC_API_KEY)

print('📥 Cargando muestra de mensajes...')

# Tomar muestra representativa
query = """
    SELECT text, archetype, datetime
    FROM slack_messages
    WHERE
        is_thread_reply = false
        AND archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
        AND text IS NOT NULL
        AND text != ''
    ORDER BY RANDOM()
    LIMIT 200
"""

df = pd.read_sql_query(query, conn)
conn.close()

print(f'✓ Cargados {len(df)} mensajes de muestra\n')

# Preparar corpus para Claude
messages_text = "\n\n---\n\n".join([
    f"[Mensaje {i+1}]\n{row['text'][:300]}"
    for i, row in df.head(100).iterrows()
])

print('🤖 Analizando con Claude Sonnet 4.5...')
print('   (Esto puede tardar 30-60 segundos)\n')

# Análisis con Claude
prompt = f"""Analiza estos 100 mensajes de un canal de Slack de soporte técnico y propón una taxonomía de arquetipos (categorías) que represente mejor los patrones reales.

MENSAJES:
{messages_text}

INSTRUCCIONES:
1. Identifica los temas y patrones principales en estos mensajes
2. Propón entre 8-15 arquetipos que capturen la mayoría de mensajes
3. Para cada arquetipo propón:
   - Nombre descriptivo (en español)
   - Descripción breve
   - 5-8 palabras clave que ayuden a identificarlo
   - % estimado de mensajes que representa

4. Los arquetipos deben ser:
   - Mutuamente excluyentes (sin solapamiento)
   - Específicos y accionables
   - Basados en el PROPÓSITO del mensaje, no solo palabras

FORMATO DE RESPUESTA (JSON):
{{
  "arquetipos": [
    {{
      "nombre": "Nombre del Arquetipo",
      "descripcion": "Qué tipo de mensajes incluye",
      "keywords": ["palabra1", "palabra2", ...],
      "porcentaje_estimado": 15,
      "ejemplos": ["Ejemplo 1", "Ejemplo 2"]
    }}
  ],
  "observaciones": "Patrones generales observados en los mensajes"
}}"""

response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4000,
    messages=[{
        "role": "user",
        "content": prompt
    }]
)

# Parsear respuesta
response_text = response.content[0].text

# Extraer JSON (Claude a veces lo envuelve en ```json```)
if '```json' in response_text:
    json_start = response_text.find('```json') + 7
    json_end = response_text.find('```', json_start)
    json_text = response_text[json_start:json_end].strip()
else:
    json_text = response_text

analysis = json.loads(json_text)

# Mostrar resultados
print('='*80)
print('🎯 ARQUETIPOS SUGERIDOS POR CLAUDE')
print('='*80)

for i, arch in enumerate(analysis['arquetipos'], 1):
    print(f"\n{i}. {arch['nombre']} (~{arch['porcentaje_estimado']}% de mensajes)")
    print(f"   Descripción: {arch['descripcion']}")
    print(f"   Keywords: {', '.join(arch['keywords'])}")
    if 'ejemplos' in arch and arch['ejemplos']:
        print(f"   Ejemplos:")
        for ej in arch['ejemplos'][:2]:
            print(f"     - {ej[:100]}...")
    print()

print('='*80)
print('💡 OBSERVACIONES GENERALES:')
print(analysis['observaciones'])
print('='*80)

# Exportar
output = {
    'analysis_date': pd.Timestamp.now().isoformat(),
    'sample_size': len(df),
    'suggested_archetypes': analysis['arquetipos'],
    'observations': analysis['observaciones']
}

with open('claude_archetype_suggestions.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print('\n✓ Análisis exportado a: claude_archetype_suggestions.json')

# Evaluar arquetipos actuales
print('\n' + '='*80)
print('📊 EVALUACIÓN DE ARQUETIPOS ACTUALES')
print('='*80)

current_archetypes = df['archetype'].unique().tolist()
print(f'\nArquetipos actuales en uso: {len(current_archetypes)}')
for arch in current_archetypes[:10]:
    count = len(df[df['archetype'] == arch])
    pct = (count / len(df)) * 100
    print(f'  - {arch}: {count} msgs ({pct:.1f}%)')

print('\n💡 Próximos pasos:')
print('  1. Comparar arquetipos sugeridos vs actuales')
print('  2. Identificar arquetipos que se pueden fusionar/dividir')
print('  3. Actualizar keywords en Tiger → Arquetipos')
print('  4. Re-ejecutar análisis para validar mejora')
