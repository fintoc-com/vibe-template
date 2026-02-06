#!/usr/bin/env python3
"""
Mejora los arquetipos usando BERTopic para descubrir clusters naturales.

Este script:
1. Carga mensajes de la DB
2. Genera embeddings
3. Usa BERTopic para encontrar clusters naturales
4. Genera arquetipos basados en los clusters reales
5. Exporta sugerencias de arquetipos mejorados
"""

import os
import psycopg2
from dotenv import load_dotenv
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
import pandas as pd
from sklearn.metrics import silhouette_score

load_dotenv()

# Conectar a DB
DATABASE_URL = os.getenv('DATABASE_URL')
conn = psycopg2.connect(DATABASE_URL)

print('📥 Cargando mensajes de la base de datos...')
query = """
    SELECT id, text, archetype, datetime
    FROM slack_messages
    WHERE
        is_thread_reply = false
        AND archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
        AND text IS NOT NULL
        AND text != ''
    ORDER BY datetime DESC
    LIMIT 3000
"""

df = pd.read_sql_query(query, conn)
conn.close()

print(f'✓ Cargados {len(df)} mensajes\n')

# Generar embeddings
print('🧠 Generando embeddings...')
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')
docs = df['text'].tolist()
embeddings = model.encode(docs, show_progress_bar=True)

# Ejecutar BERTopic con diferentes configuraciones
print('\n🔍 Probando diferentes configuraciones de clustering...\n')

configs = [
    {'min_topic_size': 10, 'nr_topics': 'auto', 'name': 'Auto (min 10 msgs)'},
    {'min_topic_size': 15, 'nr_topics': 'auto', 'name': 'Auto (min 15 msgs)'},
    {'min_topic_size': 20, 'nr_topics': 'auto', 'name': 'Auto (min 20 msgs)'},
    {'min_topic_size': 10, 'nr_topics': 15, 'name': 'Fixed 15 clusters'},
    {'min_topic_size': 10, 'nr_topics': 12, 'name': 'Fixed 12 clusters'},
]

best_score = -1
best_model = None
best_config = None
best_topics = None

for config in configs:
    print(f"Probando: {config['name']}")

    topic_model = BERTopic(
        embedding_model=model,
        language='spanish',
        calculate_probabilities=False,
        verbose=False,
        min_topic_size=config['min_topic_size'],
        nr_topics=config['nr_topics']
    )

    topics, _ = topic_model.fit_transform(docs, embeddings)

    # Calcular silhouette score (excluir outliers -1)
    valid_mask = topics != -1
    if sum(valid_mask) > 0:
        score = silhouette_score(embeddings[valid_mask], [topics[i] for i in range(len(topics)) if valid_mask[i]])
        n_topics = len(set(topics)) - (1 if -1 in topics else 0)
        n_outliers = sum(topics == -1)

        print(f"  → {n_topics} clusters, {n_outliers} outliers")
        print(f"  → Silhouette Score: {score:.3f}\n")

        if score > best_score:
            best_score = score
            best_model = topic_model
            best_config = config
            best_topics = topics

print('='*80)
print(f'🏆 MEJOR CONFIGURACIÓN: {best_config["name"]}')
print(f'   Silhouette Score: {best_score:.3f}')
print('='*80 + '\n')

# Agregar topics al dataframe
df['discovered_topic'] = best_topics

# Generar recomendaciones de arquetipos
print('📊 ARQUETIPOS RECOMENDADOS:\n')
print('='*80)

topic_info = best_model.get_topic_info()
topic_info = topic_info[topic_info['Topic'] != -1]

archetype_suggestions = []

for _, row in topic_info.iterrows():
    topic_num = row['Topic']
    count = row['Count']

    # Obtener palabras clave
    topic_words = best_model.get_topic(topic_num)
    if not topic_words:
        continue

    keywords = [word for word, _ in topic_words[:10]]

    # Generar nombre sugerido
    top_3_words = [word for word, _ in topic_words[:3]]
    suggested_name = ' + '.join([w.title() for w in top_3_words])

    print(f'\n📌 ARQUETIPO SUGERIDO {topic_num + 1}: "{suggested_name}"')
    print(f'   Mensajes: {count}')
    print(f'   Keywords: {", ".join(keywords)}')

    # Mostrar ejemplos
    topic_messages = df[df['discovered_topic'] == topic_num].head(3)
    print('\n   Ejemplos:')
    for idx, msg in topic_messages.iterrows():
        text_preview = msg['text'][:120].replace('\n', ' ')
        print(f'   - "{text_preview}..."')

    archetype_suggestions.append({
        'name': suggested_name,
        'keywords': keywords[:8],
        'message_count': count,
        'description': f'Cluster automático basado en: {", ".join(top_3_words)}'
    })

    print('-'*80)

# Exportar sugerencias
import json
with open('suggested_archetypes.json', 'w', encoding='utf-8') as f:
    json.dump(archetype_suggestions, f, indent=2, ensure_ascii=False)

print(f'\n✓ Sugerencias exportadas a: suggested_archetypes.json')
print('\n💡 Próximos pasos:')
print('  1. Revisar los arquetipos sugeridos')
print('  2. Ajustar nombres y keywords manualmente')
print('  3. Crear arquetipos en Tiger → Arquetipos')
print('  4. Ejecutar reclasificación de mensajes')
