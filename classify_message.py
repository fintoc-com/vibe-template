#!/usr/bin/env python3
"""
Classify a Slack message using the trained BERTopic model.

Usage:
    python classify_message.py "message text here"

Output:
    JSON with topic_id and confidence
"""

import sys
import json
from bertopic import BERTopic

# Load the saved model
MODEL_DIR = 'bertopic_model'

try:
    topic_model = BERTopic.load(MODEL_DIR)
except Exception as e:
    print(json.dumps({
        'error': f'Failed to load model: {str(e)}',
        'topic_id': -1,
        'confidence': 'low',
    }))
    sys.exit(1)

def classify_message(text: str):
    """
    Classify a single message and return topic ID with confidence.
    """
    if not text or text.strip() == '':
        return {
            'topic_id': -1,
            'archetype': 'Sin Clasificar',
            'confidence': 'low',
        }

    try:
        # Transform the text to get topic
        topics, _ = topic_model.transform([text])
        topic_id = int(topics[0])

        # Determine confidence based on topic ID
        if topic_id == -1:
            confidence = 'low'  # Outliers
        elif topic_id in [0, 1, 2, 3]:
            confidence = 'high'  # High-frequency topics
        else:
            confidence = 'medium'  # Other topics

        return {
            'topic_id': topic_id,
            'confidence': confidence,
        }

    except Exception as e:
        return {
            'error': f'Classification failed: {str(e)}',
            'topic_id': -1,
            'confidence': 'low',
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'No text provided',
            'topic_id': -1,
            'confidence': 'low',
        }))
        sys.exit(1)

    message_text = sys.argv[1]
    result = classify_message(message_text)
    print(json.dumps(result))
