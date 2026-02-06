#!/usr/bin/env python3
"""
Migrate existing messages to use BERTopic archetypes.

This script:
1. Loads all parent messages from the database
2. Classifies each message using the trained BERTopic model
3. Updates the database with new archetype labels

Usage:
    python migrate_archetypes.py
"""

import os
import psycopg2
from dotenv import load_dotenv
from bertopic import BERTopic

# Archetype mapping from topic IDs to names
ARCHETYPE_MAPPING = {
    0: 'Tareas Operacionales Generales',
    1: 'Alertas de Disponibilidad Bancaria',
    2: 'Transferencias Estado-Security',
    3: 'Onboarding Merchants Kushki',
    4: 'Dashboard Ops Collection',
    5: 'Advertencias Bank Statements BICE',
    6: 'Gestión de Contracargos',
    7: 'Proceso Nómina Unired',
    8: 'Refresh Cuentas BICE',
    9: 'Subida Universo BancoChile',
    10: 'Documentos Card Payout',
    11: 'Reintentos Refund Disbursal',
    12: 'Reacciones y Emojis',
    13: 'Estado Lock de Bancos',
    -1: 'Sin Clasificar',  # Outliers
}

def get_archetype_name(topic_id: int) -> str:
    return ARCHETYPE_MAPPING.get(topic_id, 'Sin Clasificar')

def get_confidence(topic_id: int) -> str:
    """Determine confidence level based on topic ID."""
    if topic_id == -1:
        return 'low'  # Outliers
    elif topic_id in [0, 1, 2, 3]:
        return 'high'  # High-frequency topics
    else:
        return 'medium'  # Other topics

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError('DATABASE_URL not found in .env file')

print('Loading BERTopic model...')
topic_model = BERTopic.load('bertopic_model')
print('Model loaded successfully.')

print('Connecting to database...')
conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

# Fetch all parent messages that aren't fixed archetypes (RoboCops, Reminders, Thread Replies)
print('Fetching messages to migrate...')
query = """
    SELECT id, text
    FROM slack_messages
    WHERE
        is_thread_reply = false
        AND archetype NOT IN ('RoboCops (Bot)', 'Reminder (Automático)', 'Thread Reply')
        AND text IS NOT NULL
        AND text != ''
    ORDER BY datetime DESC
"""

cursor.execute(query)
messages = cursor.fetchall()

total = len(messages)
print(f'Found {total} messages to migrate.')

if total == 0:
    print('No messages to migrate.')
    cursor.close()
    conn.close()
    exit(0)

# Batch process messages
print('Classifying messages with BERTopic...')
message_ids = [msg[0] for msg in messages]
message_texts = [msg[1] for msg in messages]

# Transform all messages at once
topics, probs = topic_model.transform(message_texts)

# Update database with new archetypes
print('Updating database...')
updated = 0
failed = 0

for i, (msg_id, topic_id) in enumerate(zip(message_ids, topics)):
    try:
        archetype_name = get_archetype_name(int(topic_id))
        confidence = get_confidence(int(topic_id))

        cursor.execute("""
            UPDATE slack_messages
            SET
                archetype = %s,
                archetype_confidence = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (archetype_name, confidence, msg_id))

        updated += 1

        if (i + 1) % 50 == 0:
            print(f'Progress: {i + 1}/{total} messages processed...')
            conn.commit()  # Commit in batches

    except Exception as e:
        print(f'Error updating message {msg_id}: {e}')
        failed += 1

# Final commit
conn.commit()
cursor.close()
conn.close()

print('\n' + '='*60)
print('MIGRATION COMPLETE')
print('='*60)
print(f'Total messages: {total}')
print(f'Successfully updated: {updated}')
print(f'Failed: {failed}')
print('\nAll messages have been migrated to BERTopic archetypes!')
