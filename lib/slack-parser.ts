/**
 * Parses Slack message formatting into readable text and HTML-friendly format
 */
export function parseSlackMessage(text: string, users: Map<string, string>, usergroups: Map<string, string>): string {
  let parsed = text;

  // Parse user mentions: <@U123456> → @username
  parsed = parsed.replace(/<@([A-Z0-9]+)>/g, (_, userId) => {
    const userName = users.get(userId) || userId;
    return `@${userName}`;
  });

  // Parse usergroup mentions: <!subteam^S123456> → @group
  parsed = parsed.replace(/<!subteam\^([A-Z0-9]+)(?:\|([^>]+))?>/g, (_, groupId, label) => {
    const groupName = label || usergroups.get(groupId) || groupId;
    return `@${groupName}`;
  });

  // Parse channel mentions: <#C123456|channel-name> → #channel-name
  parsed = parsed.replace(/<#[A-Z0-9]+\|([^>]+)>/g, (_, channelName) => {
    return `#${channelName}`;
  });

  // Parse links: <http://example.com|link text> → [link text](http://example.com)
  parsed = parsed.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, (_, url, text) => {
    return `[${text}](${url})`;
  });

  // Parse bare links: <http://example.com> → [http://example.com](http://example.com)
  parsed = parsed.replace(/<(https?:\/\/[^>]+)>/g, (_, url) => {
    return `[${url}](${url})`;
  });

  // Parse special mentions: <!here>, <!channel>, <!everyone>
  parsed = parsed.replace(/<!here>/g, '@here');
  parsed = parsed.replace(/<!channel>/g, '@channel');
  parsed = parsed.replace(/<!everyone>/g, '@everyone');

  return parsed;
}

/**
 * Categorizes a user by their role based on their name or ID
 */
export function categorizeUser(userName: string, userId: string): {
  role: 'support' | 'kam' | 'merchant' | 'bot' | 'unknown'
  category: string
} {
  const lowerName = userName.toLowerCase();
  const lowerUserId = userId.toLowerCase();

  // Bots
  if (lowerUserId.startsWith('b0') || lowerName.includes('bot') || lowerName === 'robocosp') {
    return { role: 'bot', category: 'Bots' };
  }

  // Support team
  if (['soledad', 'cristobal pinto', 'cristóbal pinto'].some((name) => lowerName.includes(name))) {
    return { role: 'support', category: 'Soporte' };
  }

  // KAMs
  if (['kenneth', 'alba'].some((name) => lowerName.includes(name))) {
    return { role: 'kam', category: 'KAMs' };
  }

  // Merchants
  if (['antonia'].some((name) => lowerName.includes(name))) {
    return { role: 'merchant', category: 'Merchants Kushki' };
  }

  return { role: 'unknown', category: 'Otros' };
}

/**
 * Determines the message type
 */
export function getMessageType(message: { subtype?: string, bot_id?: string, user?: string }): 'reminder' | 'bot' | 'user' {
  if (message.subtype === 'reminder_add' || message.subtype === 'reminder') {
    return 'reminder';
  }
  if (message.bot_id || message.user?.startsWith('B0')) {
    return 'bot';
  }
  return 'user';
}
