#!/usr/bin/env python3
"""
Descubre arquetipos usando THREADS COMPLETOS para tener más contexto.

Pipeline:
1. Agrupa mensajes por thread (parent + todas las replies)
2. Usa el thread completo para descubrir clusters con BERTopic
3. Asigna el arquetipo descubierto al mensaje PRINCIPAL
4. Exporta arquetipos para clasificación de mensajes nuevos
5. Actualiza la base de datos con las nuevas clasificaciones
"""

import os
import psycopg2
from dotenv import load_dotenv
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
import pandas as pd
from sklearn.metrics import silhouette_score
import numpy as np
from collections import defaultdict

load_dotenv()

# Conectar a DB
DATABASE_URL = os.getenv('DATABASE_URL')
conn = psycopg2.connect(DATABASE_URL)

print('='*80)
print('🧵 DESCUBRIMIENTO DE ARQUETIPOS USANDO THREADS COMPLETOS')
print('='*80)

# 1. CARGAR TODOS LOS MENSAJES (incluyendo replies)
print('\n📥 Paso 1: Cargando mensajes de la base de datos...')
query = """
    SELECT
        id,
        text,
        thread_ts,
        is_thread_reply,
        parent_message_id,
        datetime,
        archetype as current_archetype
    FROM slack_messages
    WHERE
        archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
        AND text IS NOT NULL
        AND text != ''
    ORDER BY datetime DESC
    LIMIT 5000
"""

df = pd.read_sql_query(query, conn)
print(f'✓ Cargados {len(df)} mensajes totales')
print(f'  - Mensajes principales: {len(df[df["is_thread_reply"] == False])}')
print(f'  - Replies en threads: {len(df[df["is_thread_reply"] == True])}')

# 2. AGREGAR THREADS COMPLETOS
print('\n🔗 Paso 2: Agrupando mensajes por thread...')

# Crear diccionario de threads
threads = defaultdict(list)

for _, row in df.iterrows():
    # Si es reply, agregar al thread del parent
    if row['is_thread_reply'] and row['parent_message_id']:
        thread_key = row['parent_message_id']
    else:
        # Es mensaje principal, usar su propio ID como key
        thread_key = row['id']

    threads[thread_key].append({
        'id': row['id'],
        'text': row['text'],
        'datetime': row['datetime'],
        'is_parent': not row['is_thread_reply']
    })

# Crear documentos agregados (thread completo)
thread_documents = []
parent_message_ids = []

for thread_key, messages in threads.items():
    # Ordenar mensajes por fecha
    messages.sort(key=lambda x: x['datetime'])

    # Concatenar todo el thread
    thread_text = '\n\n'.join([msg['text'] for msg in messages])

    # Guardar documento y el ID del mensaje principal
    thread_documents.append(thread_text)
    parent_message_ids.append(thread_key)

print(f'✓ Agrupados en {len(thread_documents)} threads/conversaciones')
print(f'  - Promedio de mensajes por thread: {len(df) / len(thread_documents):.1f}')

# 3. GENERAR EMBEDDINGS
print('\n🧠 Paso 3: Generando embeddings de threads completos...')
model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')
embeddings = model.encode(thread_documents, show_progress_bar=True)
print(f'✓ Embeddings generados: {embeddings.shape}')

# 4. DESCUBRIR CLUSTERS CON BERTOPIC
print('\n🔍 Paso 4: Descubriendo clusters con BERTopic...')

# Probar diferentes configuraciones
configs = [
    {'min_topic_size': 8, 'nr_topics': 'auto', 'name': 'Auto (min 8 threads)'},
    {'min_topic_size': 12, 'nr_topics': 'auto', 'name': 'Auto (min 12 threads)'},
    {'min_topic_size': 8, 'nr_topics': 15, 'name': 'Fixed 15 clusters'},
    {'min_topic_size': 8, 'nr_topics': 12, 'name': 'Fixed 12 clusters'},
]

best_score = -1
best_model = None
best_config = None
best_topics = None

for config in configs:
    print(f"\n  Probando: {config['name']}")

    topic_model = BERTopic(
        embedding_model=model,
        language='spanish',
        calculate_probabilities=False,
        verbose=False,
        min_topic_size=config['min_topic_size'],
        nr_topics=config['nr_topics']
    )

    topics, _ = topic_model.fit_transform(thread_documents, embeddings)

    # Calcular silhouette score (excluir outliers -1)
    valid_mask = np.array(topics) != -1
    if sum(valid_mask) > 10:
        score = silhouette_score(
            embeddings[valid_mask],
            [topics[i] for i in range(len(topics)) if valid_mask[i]]
        )
        n_topics = len(set(topics)) - (1 if -1 in topics else 0)
        n_outliers = sum(np.array(topics) == -1)

        print(f"    → {n_topics} clusters, {n_outliers} outliers")
        print(f"    → Silhouette Score: {score:.3f}")

        if score > best_score:
            best_score = score
            best_model = topic_model
            best_config = config
            best_topics = topics

print('\n' + '='*80)
print(f'🏆 MEJOR CONFIGURACIÓN: {best_config["name"]}')
print(f'   Silhouette Score: {best_score:.3f}')
print('='*80)

# 5. MAPEAR CLUSTERS A MENSAJES PRINCIPALES
print('\n📊 Paso 5: Asignando arquetipos a mensajes principales...')

# Crear mapeo de parent_id → topic
parent_to_topic = {}
for parent_id, topic in zip(parent_message_ids, best_topics):
    parent_to_topic[parent_id] = topic

# Crear DataFrame con solo mensajes principales
parent_messages = df[df['is_thread_reply'] == False].copy()
parent_messages['discovered_topic'] = parent_messages['id'].map(parent_to_topic)

# Generar nombres de arquetipos
topic_info = best_model.get_topic_info()
topic_info = topic_info[topic_info['Topic'] != -1]

topic_names = {}
topic_keywords = {}

print('\n📋 ARQUETIPOS DESCUBIERTOS:\n')

for _, row in topic_info.iterrows():
    topic_num = row['Topic']
    count = row['Count']

    # Obtener palabras clave
    topic_words = best_model.get_topic(topic_num)
    if not topic_words:
        continue

    keywords = [word for word, _ in topic_words[:8]]
    top_3 = [word for word, _ in topic_words[:3]]

    # Generar nombre
    archetype_name = ' + '.join([w.title() for w in top_3])
    topic_names[topic_num] = archetype_name
    topic_keywords[topic_num] = keywords

    print(f'{topic_num + 1}. "{archetype_name}" ({count} threads)')
    print(f'   Keywords: {", ".join(keywords)}')

    # Mostrar ejemplos de mensajes principales
    example_parents = parent_messages[parent_messages['discovered_topic'] == topic_num].head(2)
    print('   Ejemplos:')
    for _, msg in example_parents.iterrows():
        preview = msg['text'][:100].replace('\n', ' ')
        print(f'     - "{preview}..."')
    print()

# Asignar nombres de arquetipos
parent_messages['archetype_name'] = parent_messages['discovered_topic'].map(topic_names)
parent_messages['archetype_name'] = parent_messages['archetype_name'].fillna('Sin Clasificar')

# 6. ACTUALIZAR BASE DE DATOS
print('='*80)
print('💾 Paso 6: Actualizando base de datos...')

cursor = conn.cursor()
updated_count = 0

for _, row in parent_messages.iterrows():
    if pd.notna(row['archetype_name']) and row['archetype_name'] != 'Sin Clasificar':
        cursor.execute(
            """
            UPDATE slack_messages
            SET archetype = %s,
                archetype_confidence = 'bertopic',
                updated_at = NOW()
            WHERE id = %s
            """,
            (row['archetype_name'], row['id'])
        )
        updated_count += 1

conn.commit()
cursor.close()
conn.close()

print(f'✓ Actualizados {updated_count} mensajes principales en la base de datos')

# 7. EXPORTAR ARQUETIPOS PARA USO FUTURO
print('\n📤 Paso 7: Exportando arquetipos para clasificación futura...')

import json

archetypes_export = []

for topic_num, name in topic_names.items():
    topic_data = topic_info[topic_info['Topic'] == topic_num].iloc[0]

    archetypes_export.append({
        'name': name,
        'description': f'Arquetipo descubierto automáticamente usando {topic_data["Count"]} threads',
        'keywords': topic_keywords[topic_num],
        'priority': 100,
        'discovery_method': 'bertopic_with_threads',
        'thread_count': int(topic_data['Count']),
        'silhouette_score': float(best_score)
    })

output = {
    'discovery_date': pd.Timestamp.now().isoformat(),
    'method': 'bertopic_with_full_threads',
    'total_threads_analyzed': len(thread_documents),
    'silhouette_score': float(best_score),
    'archetypes': archetypes_export
}

with open('discovered_archetypes_from_threads.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print('✓ Arquetipos exportados a: discovered_archetypes_from_threads.json')

# 8. EXPORTAR DATOS PARA VISUALIZACIÓN
print('\n📊 Paso 8: Preparando datos para visualización...')

# Calcular embeddings de solo los mensajes principales (para visualización)
parent_texts = parent_messages['text'].tolist()
parent_embeddings = model.encode(parent_texts, show_progress_bar=True)

# Reducir a 3D para visualización
from sklearn.decomposition import PCA
pca = PCA(n_components=3)
parent_3d = pca.fit_transform(parent_embeddings)

parent_messages['pc1'] = parent_3d[:, 0]
parent_messages['pc2'] = parent_3d[:, 1]
parent_messages['pc3'] = parent_3d[:, 2]

# Exportar para notebook
export_df = parent_messages[[
    'id', 'text', 'archetype_name', 'datetime',
    'discovered_topic', 'pc1', 'pc2', 'pc3'
]].copy()

export_df.to_csv('parent_messages_with_thread_archetypes.csv', index=False)
print('✓ Datos exportados a: parent_messages_with_thread_archetypes.csv')

# RESUMEN FINAL
print('\n' + '='*80)
print('✅ PROCESO COMPLETADO')
print('='*80)
print(f'\n📊 Resultados:')
print(f'  - Threads analizados: {len(thread_documents)}')
print(f'  - Arquetipos descubiertos: {len(topic_names)}')
print(f'  - Mensajes principales actualizados: {updated_count}')
print(f'  - Silhouette Score: {best_score:.3f}')
print(f'  - Varianza PCA explicada: {pca.explained_variance_ratio_.sum():.1%}')

print('\n💡 Próximos pasos:')
print('  1. Revisa los arquetipos en: discovered_archetypes_from_threads.json')
print('  2. Visualiza en 3D con: explore_archetypes_from_threads.ipynb')
print('  3. Importa arquetipos a Tiger para clasificar mensajes nuevos')
print('  4. Los mensajes nuevos se clasificarán contra estos arquetipos')
print('\n✨ Cada mensaje nuevo entrante será comparado con estos arquetipos!')
