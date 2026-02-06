import type { NextApiRequest, NextApiResponse } from 'next';
import { protectedHandler } from '~/lib/api/protected-handler';
import { slack } from '~/lib/slack';
import { db } from '~/db';
import { runbooks } from '~/db/schema';
import { env } from '~/config/env';
import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod';

const generateRunbookSchema = z.object({
  threadTs: z.string(),
  channelId: z.string(),
  prompt: z.string().optional(),
});

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export default protectedHandler(async (req: NextApiRequest, res: NextApiResponse, session) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = generateRunbookSchema.parse(req.body);

    // Fetch thread messages from Slack
    const threadResult = await slack.conversations.replies({
      channel: body.channelId,
      ts: body.threadTs,
    });

    if (!threadResult.ok || !threadResult.messages || threadResult.messages.length === 0) {
      return res.status(404).json({ error: 'Thread not found or empty' });
    }

    // Format thread messages for Claude
    const threadMessages = threadResult.messages.map((msg, idx) => {
      const user = msg.user || 'Unknown';
      const text = msg.text || '';
      return `[Message ${idx + 1}] ${user}: ${text}`;
    }).join('\n\n');

    // Generate runbook using Claude
    const systemPrompt = `You are an expert technical writer creating runbooks from Slack conversations.

Your task is to analyze a Slack thread and create a comprehensive, well-structured runbook in Markdown format.

The runbook should include:
1. **Title**: A clear, descriptive title
2. **Overview**: Brief description of the problem/situation
3. **Context**: Important background information
4. **Steps**: Numbered steps to solve the problem or complete the task
5. **Commands**: Any code, commands, or configurations (in code blocks)
6. **Solution**: Final resolution or outcome
7. **Learnings**: Key takeaways or best practices
8. **Related Resources**: Links or references if mentioned

Format the runbook as clean, professional Markdown with proper headers, code blocks, and formatting.`;

    const userPrompt = body.prompt
      ? `${body.prompt}\n\nHere is the Slack thread conversation:\n\n${threadMessages}`
      : `Create a detailed runbook from this Slack thread conversation:\n\n${threadMessages}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const runbookContent = content.text;

    // Extract title from markdown (first # heading)
    const titleMatch = runbookContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : 'Untitled Runbook';

    // Save runbook to database
    const [runbook] = await db
      .insert(runbooks)
      .values({
        title,
        content: runbookContent,
        threadTs: body.threadTs,
        channelId: body.channelId,
        prompt: body.prompt || null,
        model: 'claude-sonnet-4-5',
        createdBy: session.user.email,
      })
      .returning();

    return res.status(201).json({
      success: true,
      runbook: {
        id: runbook.id,
        title: runbook.title,
        content: runbook.content,
        threadTs: runbook.threadTs,
        channelId: runbook.channelId,
        createdAt: runbook.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }

    console.error('Failed to generate runbook:', error);
    return res.status(500).json({ error: 'Failed to generate runbook' });
  }
});
