#!/usr/bin/env python3
"""
Download historical Slack messages to build a corpus for archetype discovery.

Usage:
    python download_slack.py --days 180 > corpus.json
    python download_slack.py --days 90 --channel C0123456789 > corpus.json
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

# Load environment variables
load_dotenv()

def download_messages(channel_id: str, days: int) -> list[dict]:
    """
    Download messages from a Slack channel for the last N days.

    Args:
        channel_id: Slack channel ID (e.g., "C0123456789")
        days: Number of days of history to download

    Returns:
        List of message dictionaries
    """
    token = os.getenv('SLACK_BOT_TOKEN')
    if not token:
        print('Error: SLACK_BOT_TOKEN not found in .env file', file=sys.stderr)
        sys.exit(1)

    client = WebClient(token=token)

    # Calculate oldest timestamp (Unix timestamp)
    oldest_date = datetime.now() - timedelta(days=days)
    oldest_ts = oldest_date.timestamp()

    print(f'Downloading messages from channel {channel_id}...', file=sys.stderr)
    print(f'Date range: {oldest_date.strftime("%Y-%m-%d")} to {datetime.now().strftime("%Y-%m-%d")}', file=sys.stderr)

    all_messages = []
    cursor = None
    page = 1

    try:
        while True:
            print(f'Fetching page {page}...', file=sys.stderr)

            # Fetch messages
            response = client.conversations_history(
                channel=channel_id,
                oldest=str(oldest_ts),
                limit=1000,  # Max per page
                cursor=cursor
            )

            messages = response.get('messages', [])
            all_messages.extend(messages)

            print(f'  Retrieved {len(messages)} messages (total: {len(all_messages)})', file=sys.stderr)

            # Check if there are more pages
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break

            page += 1

    except SlackApiError as e:
        print(f'Error fetching messages: {e.response["error"]}', file=sys.stderr)
        sys.exit(1)

    print(f'\nTotal messages downloaded: {len(all_messages)}', file=sys.stderr)

    # Filter out bot messages and format for output
    filtered_messages = []
    for msg in all_messages:
        # Skip bot messages (except our bot's mentions)
        if msg.get('bot_id') and not msg.get('text', '').startswith('<@'):
            continue

        # Skip empty messages
        if not msg.get('text'):
            continue

        filtered_messages.append({
            'ts': msg.get('ts'),
            'text': msg.get('text'),
            'user': msg.get('user'),
            'thread_ts': msg.get('thread_ts'),
            'reply_count': msg.get('reply_count', 0),
            'datetime': datetime.fromtimestamp(float(msg.get('ts'))).isoformat()
        })

    print(f'Filtered to {len(filtered_messages)} non-bot messages', file=sys.stderr)

    return filtered_messages


def main():
    parser = argparse.ArgumentParser(
        description='Download historical Slack messages for corpus analysis'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=180,
        help='Number of days of history to download (default: 180)'
    )
    parser.add_argument(
        '--channel',
        type=str,
        help='Slack channel ID (defaults to SLACK_CHANNEL_ID from .env)'
    )

    args = parser.parse_args()

    # Get channel ID from args or env
    channel_id = args.channel or os.getenv('SLACK_CHANNEL_ID')
    if not channel_id:
        print('Error: Channel ID not provided and SLACK_CHANNEL_ID not found in .env', file=sys.stderr)
        sys.exit(1)

    # Download messages
    messages = download_messages(channel_id, args.days)

    # Output as JSON to stdout
    corpus = {
        'channel_id': channel_id,
        'days': args.days,
        'message_count': len(messages),
        'downloaded_at': datetime.now().isoformat(),
        'messages': messages
    }

    print(json.dumps(corpus, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
