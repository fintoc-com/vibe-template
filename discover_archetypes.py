#!/usr/bin/env python3
"""
Discover Slack message archetypes using BERTopic.

This script:
1. Fetches parent messages from the database (excluding RoboCops and Reminders)
2. Calculates embeddings using a multilingual pre-trained model
3. Runs BERTopic clustering to discover archetypes
4. Outputs semantic descriptions for each discovered archetype
"""

import os
import psycopg2
from dotenv import load_dotenv
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
import pandas as pd

# Load environment variables
load_dotenv()

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError('DATABASE_URL not found in .env file')

print('Connecting to database...')
conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

# Fetch parent messages (excluding RoboCops and Reminders)
print('Fetching parent messages from database...')
query = """
    SELECT
        id,
        text,
        archetype,
        category_role,
        category_group,
        datetime
    FROM slack_messages
    WHERE
        is_thread_reply = false
        AND archetype NOT IN ('RoboCop', 'Reminder', 'Recordatorio Automático')
        AND text IS NOT NULL
        AND text != ''
    ORDER BY datetime DESC
"""

cursor.execute(query)
rows = cursor.fetchall()
cursor.close()
conn.close()

if len(rows) == 0:
    print('No messages found to analyze.')
    exit(0)

print(f'Found {len(rows)} parent messages to analyze.')

# Create DataFrame
df = pd.DataFrame(rows, columns=['id', 'text', 'archetype', 'category_role', 'category_group', 'datetime'])

# Extract texts for clustering
docs = df['text'].tolist()

print('Loading sentence transformer model...')
# Use multilingual model that works well with Spanish
embedding_model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')

print('Calculating embeddings...')
embeddings = embedding_model.encode(docs, show_progress_bar=True)

print('Running BERTopic clustering...')
# Initialize BERTopic with Spanish stop words
topic_model = BERTopic(
    embedding_model=embedding_model,
    language='spanish',
    calculate_probabilities=False,  # Faster
    verbose=True,
    min_topic_size=3,  # Minimum 3 messages per archetype
    nr_topics='auto'  # Let BERTopic decide optimal number
)

# Fit the model
topics, probs = topic_model.fit_transform(docs, embeddings)

# Add topics to dataframe
df['discovered_topic'] = topics

print('\n' + '='*80)
print('DISCOVERED ARCHETYPES')
print('='*80 + '\n')

# Get topic info
topic_info = topic_model.get_topic_info()

# Filter out outlier topic (-1)
topic_info = topic_info[topic_info['Topic'] != -1]

for _, row in topic_info.iterrows():
    topic_num = row['Topic']
    count = row['Count']

    # Get top words for this topic
    topic_words = topic_model.get_topic(topic_num)
    if not topic_words:
        continue

    # Generate archetype name from top keywords
    keywords = [word for word, _ in topic_words[:5]]
    archetype_name = ' + '.join(keywords[:3]).title()

    print(f'ARCHETYPE {topic_num}: {archetype_name}')
    print(f'Message count: {count}')
    print(f'Keywords: {", ".join([f"{word} ({score:.3f})" for word, score in topic_words[:10]])}')

    # Show representative messages
    topic_messages = df[df['discovered_topic'] == topic_num].head(3)
    print('\nRepresentative messages:')
    for idx, msg in topic_messages.iterrows():
        text_preview = msg['text'][:150].replace('\n', ' ')
        print(f'  - [{msg["datetime"]}] {text_preview}...')

    print('\n' + '-'*80 + '\n')

# Show outliers (messages that didn't fit any cluster)
outliers = df[df['discovered_topic'] == -1]
if len(outliers) > 0:
    print(f'OUTLIERS: {len(outliers)} messages did not fit into any archetype')
    print('These are unique or rare message types.\n')

# Summary statistics
print('='*80)
print('SUMMARY')
print('='*80)
print(f'Total messages analyzed: {len(df)}')
print(f'Archetypes discovered: {len(topic_info)}')
print(f'Outlier messages: {len(outliers)}')
print(f'Average messages per archetype: {len(df[df["discovered_topic"] != -1]) / max(len(topic_info), 1):.1f}')

# Save results to CSV for further analysis
output_file = 'discovered_archetypes.csv'
df.to_csv(output_file, index=False)
print(f'\nResults saved to {output_file}')

# Save the model for future use
model_dir = 'bertopic_model'
topic_model.save(model_dir)
print(f'Model saved to {model_dir}/')
print('\nYou can load this model later with: BERTopic.load("{}")'.format(model_dir))
