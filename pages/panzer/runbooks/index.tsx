import type { InferGetServerSidePropsType } from 'next';
import { requireAuth, serializeUser } from '~/lib/ssr/require-auth';
import { db } from '~/db';
import { runbooks } from '~/db/schema';
import { desc } from 'drizzle-orm';
import { Button } from '~/components/ui/button';
import { ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import { PanzerNav } from '~/components/panzer-nav';

export const getServerSideProps = requireAuth(async (_ctx, session) => {
  const allRunbooks = await db
    .select({
      id: runbooks.id,
      title: runbooks.title,
      threadTs: runbooks.threadTs,
      channelId: runbooks.channelId,
      createdBy: runbooks.createdBy,
      createdAt: runbooks.createdAt,
    })
    .from(runbooks)
    .orderBy(desc(runbooks.createdAt))
    .limit(100);

  return {
    props: {
      user: serializeUser(session.user),
      runbooks: allRunbooks.map((r) => ({
        id: r.id,
        title: r.title,
        threadTs: r.threadTs,
        channelId: r.channelId,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  };
});

export default function RunbooksPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const { runbooks } = props;

  return (
    <div className="min-h-screen bg-background">
      <PanzerNav />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Runbooks</h1>
          <p className="text-muted-foreground">
            Documentación generada automáticamente desde threads de Slack
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Total Runbooks
              </span>
            </div>
            <div className="text-3xl font-bold">{runbooks.length}</div>
          </div>

          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-muted-foreground">
                Última Semana
              </span>
            </div>
            <div className="text-3xl font-bold">
              {
                runbooks.filter(
                  (r) =>
                    new Date(r.createdAt) >
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                ).length
              }
            </div>
          </div>

          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-muted-foreground">
                Último Mes
              </span>
            </div>
            <div className="text-3xl font-bold">
              {
                runbooks.filter(
                  (r) =>
                    new Date(r.createdAt) >
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                ).length
              }
            </div>
          </div>
        </div>

        {/* Runbooks List */}
        {runbooks.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No hay runbooks todavía</h3>
            <p className="text-muted-foreground mb-4">
              Menciona @Panzer en un thread de Slack con "crea el runbook" para generar
              uno.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {runbooks.map((runbook) => (
              <div
                key={runbook.id}
                className="bg-card rounded-lg border p-6 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/panzer/runbooks/${runbook.id}`}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <h3 className="text-lg font-semibold mb-2 truncate hover:text-primary">
                      {runbook.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {new Date(runbook.createdAt).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>•</span>
                      <span>{runbook.createdBy}</span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <a
                      href={`slack://channel?team=T010B5E5ZML&id=${runbook.channelId}&message=${runbook.threadTs}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
