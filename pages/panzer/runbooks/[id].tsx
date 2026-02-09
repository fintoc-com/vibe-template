import type { InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';
import ReactMarkdown from 'react-markdown';
import { requireAuth, serializeUser } from '~/lib/ssr/require-auth';
import { db } from '~/db';
import { runbooks } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { Button } from '~/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export const getServerSideProps = requireAuth(async (ctx, session) => {
  const id = parseInt(ctx.params?.id as string, 10);

  if (isNaN(id)) {
    return {
      notFound: true,
    };
  }

  const [runbook] = await db
    .select()
    .from(runbooks)
    .where(eq(runbooks.id, id))
    .limit(1);

  if (!runbook) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user: serializeUser(session.user),
      runbook: {
        id: runbook.id,
        title: runbook.title,
        content: runbook.content,
        threadTs: runbook.threadTs,
        channelId: runbook.channelId,
        createdBy: runbook.createdBy,
        createdAt: runbook.createdAt.toISOString(),
        updatedAt: runbook.updatedAt.toISOString(),
      },
    },
  };
});

export default function RunbookPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const router = useRouter();
  const { runbook } = props;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/panzer/runbooks')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Runbooks
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {runbook.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Creado: {new Date(runbook.createdAt).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>•</span>
                <span>Por: {runbook.createdBy}</span>
              </div>
            </div>

            <Link
              href={`slack://channel?team=T010B5E5ZML&id=${runbook.channelId}&message=${runbook.threadTs}`}
              target="_blank"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver en Slack
              </Button>
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="bg-card rounded-lg border p-8">
          <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:mb-4 prose-headings:mt-8 prose-headings:mb-4 prose-li:my-1">
            <ReactMarkdown>{runbook.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
