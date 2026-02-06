#!/usr/bin/env python3
"""
Backfill: Descarga e importa mensajes históricos de Slack a la base de datos.

Este script:
1. Descarga mensajes de los últimos N días desde Slack
2. Los inserta en la base de datos
3. Los clasifica básicamente (sin arquetipo específico por ahora)
4. Permite ejecutar análisis posterior con Claude/BERTopic

Uso:
    python backfill_slack_history.py --days 90
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from datetime import datetime, timedelta
import argparse
import time

load_dotenv()

# Configuración
SLACK_BOT_TOKEN = os.getenv('SLACK_BOT_TOKEN')
SLACK_CHANNEL_ID = os.getenv('SLACK_CHANNEL_ID')
DATABASE_URL = os.getenv('DATABASE_URL')

if not all([SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, DATABASE_URL]):
    print('❌ Faltan variables de entorno: SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, DATABASE_URL')
    sys.exit(1)

# Clients
slack_client = WebClient(token=SLACK_BOT_TOKEN)
db_conn = psycopg2.connect(DATABASE_URL)
db_cursor = db_conn.cursor()

def get_user_info(user_id):
    """Cache de usuarios para no hacer muchas llamadas a la API."""
    cache_key = f'user_{user_id}'

    # Verificar si existe en DB
    db_cursor.execute("SELECT name, real_name FROM slack_users WHERE id = %s", (user_id,))
    result = db_cursor.fetchone()

    if result:
        return {'name': result[0], 'real_name': result[1]}

    # Fetch from Slack
    try:
        response = slack_client.users_info(user=user_id)
        user = response['user']

        # Insertar en DB
        db_cursor.execute("""
            INSERT INTO slack_users (id, name, real_name, is_bot, created_at, updated_at)
            VALUES (%s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                real_name = EXCLUDED.real_name,
                updated_at = NOW()
        """, (
            user_id,
            user.get('name', 'Unknown'),
            user.get('real_name', 'Unknown'),
            user.get('is_bot', False)
        ))
        db_conn.commit()

        return {'name': user.get('name', 'Unknown'), 'real_name': user.get('real_name', 'Unknown')}

    except Exception as e:
        print(f'⚠️  Error fetching user {user_id}: {e}')
        return {'name': 'Unknown', 'real_name': 'Unknown'}

def classify_message_simple(text, msg_type, subtype):
    """Clasificación simple de mensaje (sin Claude por ahora)."""
    text_lower = text.lower()

    # Detectar RoboCops y Reminders
    if 'robocop' in text_lower or subtype == 'reminder_add':
        return 'RoboCop'

    if 'reminder' in text_lower or subtype == 'reminder':
        return 'Recordatorio Automático'

    # Detectar tipo de usuario (pendiente de refinamiento)
    if any(word in text_lower for word in ['error', 'problema', 'fallo', 'bug']):
        category = 'Support'
    elif any(word in text_lower for word in ['deploy', 'release', 'producción']):
        category = 'DevOps'
    elif any(word in text_lower for word in ['pregunta', 'cómo', 'duda', '?']):
        category = 'Question'
    else:
        category = 'General'

    return 'Sin Clasificar'  # Será reclasificado después

def message_exists(message_id):
    """Verifica si un mensaje ya existe en la DB."""
    db_cursor.execute("SELECT id FROM slack_messages WHERE id = %s", (message_id,))
    return db_cursor.fetchone() is not None

def insert_message(msg, channel_id):
    """Inserta un mensaje en la base de datos."""
    message_id = msg.get('ts')

    # Skip si ya existe
    if message_exists(message_id):
        return False

    # Obtener info del usuario
    user_id = msg.get('user', 'UNKNOWN')
    if user_id != 'UNKNOWN':
        user_info = get_user_info(user_id)
    else:
        user_info = {'name': 'Unknown', 'real_name': 'Unknown'}

    # Determinar si es thread reply
    is_thread_reply = 'thread_ts' in msg and msg['thread_ts'] != message_id
    parent_message_id = msg.get('thread_ts') if is_thread_reply else None

    # Solo establecer parent_message_id si el parent existe en la DB
    if parent_message_id and not message_exists(parent_message_id):
        parent_message_id = None  # Parent no existe todavía, lo dejamos NULL por ahora

    # Clasificación simple
    msg_type = msg.get('type', 'message')
    subtype = msg.get('subtype', '')
    text = msg.get('text', '')

    archetype = classify_message_simple(text, msg_type, subtype)

    # Fecha
    timestamp_float = float(message_id)
    message_datetime = datetime.fromtimestamp(timestamp_float)

    # Insertar
    try:
        db_cursor.execute("""
            INSERT INTO slack_messages (
                id,
                channel_id,
                text,
                raw_text,
                user_id,
                timestamp,
                datetime,
                type,
                subtype,
                category_role,
                category_group,
                topic,
                topic_color,
                summary,
                archetype,
                archetype_confidence,
                is_ignored,
                thread_ts,
                is_thread_reply,
                parent_message_id,
                created_at,
                updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
            )
        """, (
            message_id,
            channel_id,
            text,
            text,  # raw_text = text por ahora
            user_id,
            message_id,
            message_datetime,
            msg_type,
            subtype,
            'User',  # category_role (pendiente de clasificación)
            'General',  # category_group (pendiente de clasificación)
            'General',  # topic (pendiente de clasificación)
            '#808080',  # topic_color
            text[:200],  # summary
            archetype,
            'backfill',  # archetype_confidence
            False,  # is_ignored
            msg.get('thread_ts'),
            is_thread_reply,
            parent_message_id
        ))
        return True
    except Exception as e:
        print(f'❌ Error insertando mensaje {message_id}: {e}')
        return False

def backfill_messages(days=90):
    """Backfill de mensajes históricos."""
    print('='*80)
    print(f'📥 BACKFILL DE MENSAJES HISTÓRICOS DE SLACK')
    print('='*80)

    # Calcular fecha de inicio
    cutoff_date = datetime.now() - timedelta(days=days)
    oldest_ts = cutoff_date.timestamp()

    print(f'\n📅 Descargando mensajes desde: {cutoff_date.strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'📺 Canal: {SLACK_CHANNEL_ID}')
    print(f'⏱️  Paso 1: Descargando todos los mensajes...\n')

    all_messages = []
    cursor = None
    page = 1

    # PASO 1: Descargar TODOS los mensajes
    try:
        while True:
            print(f'📄 Página {page}...', end=' ')

            # Fetch messages
            response = slack_client.conversations_history(
                channel=SLACK_CHANNEL_ID,
                oldest=str(oldest_ts),
                limit=1000,
                cursor=cursor
            )

            messages = response.get('messages', [])
            all_messages.extend(messages)

            print(f'✓ {len(messages)} msgs (total: {len(all_messages)})')

            # Verificar si hay más páginas
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break

            page += 1
            time.sleep(1)  # Rate limiting

    except SlackApiError as e:
        print(f'\n❌ Error de Slack API: {e.response["error"]}')
        db_conn.rollback()
        return
    except Exception as e:
        print(f'\n❌ Error: {e}')
        db_conn.rollback()
        return

    # PASO 2: Ordenar mensajes por timestamp (más antiguo primero)
    print(f'\n⏱️  Paso 2: Ordenando mensajes por timestamp...')
    all_messages.sort(key=lambda m: float(m.get('ts', 0)))
    print(f'✓ {len(all_messages)} mensajes ordenados (más antiguo → más nuevo)')

    # PASO 3: Insertar mensajes en orden
    print(f'\n💾 Paso 3: Insertando mensajes en la base de datos...')
    total_messages = len(all_messages)
    inserted_messages = 0
    skipped_messages = 0

    for i, msg in enumerate(all_messages, 1):
        if i % 100 == 0:
            print(f'   Procesando {i}/{total_messages}...', end='\r')

        if insert_message(msg, SLACK_CHANNEL_ID):
            inserted_messages += 1
        else:
            skipped_messages += 1

        # Commit cada 100 mensajes
        if i % 100 == 0:
            db_conn.commit()

    # Commit final
    db_conn.commit()
    print(f'   Procesando {total_messages}/{total_messages}... ✓')

    # Ahora hacer una segunda pasada para actualizar parent_message_id NULL
    print(f'\n🔗 Paso 4: Actualizando referencias de threads...')
    db_cursor.execute("""
        UPDATE slack_messages
        SET parent_message_id = thread_ts
        WHERE is_thread_reply = true
          AND parent_message_id IS NULL
          AND thread_ts IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM slack_messages parent
              WHERE parent.id = slack_messages.thread_ts
          )
    """)
    updated_refs = db_cursor.rowcount
    db_conn.commit()
    print(f'✓ Actualizadas {updated_refs} referencias de threads')

    # Resumen
    print('\n' + '='*80)
    print('✅ BACKFILL COMPLETADO')
    print('='*80)
    print(f'\n📊 Resumen:')
    print(f'  - Total de mensajes procesados: {total_messages:,}')
    print(f'  - Mensajes nuevos insertados: {inserted_messages:,}')
    print(f'  - Mensajes ya existentes: {skipped_messages:,}')

    # Verificar en DB
    db_cursor.execute("""
        SELECT
            MIN(datetime) as oldest,
            MAX(datetime) as newest,
            COUNT(*) as total
        FROM slack_messages
    """)
    oldest, newest, total = db_cursor.fetchone()

    print(f'\n📅 Rango de datos en DB:')
    print(f'  - Más antiguo: {oldest.strftime("%Y-%m-%d")}')
    print(f'  - Más reciente: {newest.strftime("%Y-%m-%d")}')
    print(f'  - Total en DB: {total:,} mensajes')
    print(f'  - Días de historia: {(newest - oldest).days}')

    print('\n💡 Próximos pasos:')
    print('  1. Ejecuta clasificación con Claude:')
    print('     python claude_exhaustive_analysis.py')
    print('  2. O ejecuta análisis con BERTopic:')
    print('     python discover_archetypes_with_threads.py')
    print('  3. Visualiza resultados:')
    print('     jupyter notebook explore_archetypes_from_threads.ipynb')

def main():
    parser = argparse.ArgumentParser(
        description='Backfill de mensajes históricos desde Slack'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=90,
        help='Número de días de historia a descargar (default: 90)'
    )

    args = parser.parse_args()

    # Confirmar con usuario
    print(f'\n⚠️  Este script descargará los últimos {args.days} días de mensajes de Slack.')
    print(f'   Canal: {SLACK_CHANNEL_ID}')
    print(f'   Esto puede tardar varios minutos.')

    confirm = input('\n¿Continuar? (s/n): ')
    if confirm.lower() != 's':
        print('Cancelado.')
        sys.exit(0)

    backfill_messages(args.days)

    # Cleanup
    db_cursor.close()
    db_conn.close()

if __name__ == '__main__':
    main()
