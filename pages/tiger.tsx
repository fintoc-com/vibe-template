import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { InferGetServerSidePropsType } from 'next';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { RefreshCw, Hash, TrendingUp, Calendar, BarChart3, Moon, Sun, ChevronDown, ChevronUp, Download, Edit as EditIcon, Settings, EyeOff } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { requireAuth, serializeUser } from '~/lib/ssr/require-auth';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { TigerNav } from '~/components/tiger-nav';

const messagesSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    text: z.string(),
    rawText: z.string(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      realName: z.string(),
      isBot: z.boolean(),
    }),
    timestamp: z.string(),
    datetime: z.string().nullable(),
    type: z.enum(['reminder', 'bot', 'user']),
    category: z.object({
      role: z.enum(['support', 'kam', 'merchant', 'bot', 'unknown']),
      group: z.string(),
    }),
    topic: z.object({
      topic: z.string(),
      color: z.string(),
    }),
    summary: z.string(),
    archetype: z.object({
      archetype: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
    subtype: z.string().optional().nullable(),
    isIgnored: z.boolean(),
  })),
  channel: z.string(),
});

type Message = z.infer<typeof messagesSchema>['messages'][number];

export const getServerSideProps = requireAuth(async (_ctx, session) => ({
  props: {
    user: serializeUser(session.user),
  },
}));

// Chart colors - vibrant and modern palette
const CHART_COLORS = [
  '#3b82f6', // blue - primary
  '#f97316', // orange
  '#10b981', // green
  '#8b5cf6', // purple
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // cyan
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#84cc16', // lime
];

export default function TigerPage({ user }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [channelId, setChannelId] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<{ name: string, messages: Message[] } | null>(null);
  const [chartDays, setChartDays] = useState(30);
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hiddenArchetypes, setHiddenArchetypes] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ newMessages: number, updatedMessages: number } | null>(null);

  // Correction modal state
  const [correctionMessage, setCorrectionMessage] = useState<Message | null>(null);
  const [newArchetype, setNewArchetype] = useState('');
  const [keywords, setKeywords] = useState('');
  const [addToManual, setAddToManual] = useState(false);
  const [isCorrectingArchetype, setIsCorrectingArchetype] = useState(false);

  // Apply dark mode class when state changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Toggle archetype visibility in chart
  const toggleArchetype = (archetype: string) => {
    setHiddenArchetypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(archetype)) {
        newSet.delete(archetype);
      } else {
        newSet.add(archetype);
      }
      return newSet;
    });
  };

  // Sync messages from Slack to database
  const syncMessages = async () => {
    setIsSyncing(true);
    setSyncStats(null);
    try {
      const params = new URLSearchParams();
      if (channelId) params.set('channelId', channelId);
      params.set('days', '90'); // Sync 90 days to match chart data

      const response = await fetch(`/api/slack/sync?${params.toString()}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync messages');
      }

      const result = await response.json();
      setSyncStats({
        newMessages: result.stats.newMessages,
        updatedMessages: result.stats.updatedMessages,
      });

      // Refetch messages after sync
      await refetch();
    } catch (error) {
      console.error('Sync error:', error);
      alert('Error al sincronizar mensajes de Slack');
    } finally {
      setIsSyncing(false);
    }
  };

  // Correct archetype classification
  const correctArchetype = async () => {
    if (!correctionMessage || !newArchetype.trim()) {
      alert('Por favor ingresa el nuevo arquetipo');
      return;
    }

    setIsCorrectingArchetype(true);
    try {
      const keywordList = keywords.trim()
        ? keywords.split(',').map(k => k.trim()).filter(Boolean)
        : [];

      const response = await fetch('/api/archetypes/correct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: correctionMessage.id,
          correctedArchetype: newArchetype.trim(),
          addToManualArchetypes: addToManual && keywordList.length > 0,
          keywords: keywordList.length > 0 ? keywordList : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to correct archetype');
      }

      // Refetch messages to show updated archetype
      await refetch();

      // Close modal and reset state
      setCorrectionMessage(null);
      setNewArchetype('');
      setKeywords('');
      setAddToManual(false);

      alert('Arquetipo corregido exitosamente');
    } catch (error) {
      console.error('Correction error:', error);
      alert('Error al corregir arquetipo');
    } finally {
      setIsCorrectingArchetype(false);
    }
  };

  // Ignore message
  const ignoreMessage = async (messageId: string) => {
    if (!confirm('¿Estás seguro de ignorar este mensaje? No aparecerá en ninguna vista del dashboard.')) {
      return;
    }

    try {
      const response = await fetch('/api/messages/ignore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          ignored: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to ignore message');
      }

      // Refetch messages to update view
      await refetch();
      alert('Mensaje ignorado exitosamente');
    } catch (error) {
      console.error('Ignore error:', error);
      alert('Error al ignorar mensaje');
    }
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['slack-messages-90d', channelId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (channelId) params.set('channelId', channelId);
      params.set('days', '90'); // Fetch 90 days to support all chart views

      const response = await fetch(`/api/slack/messages?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch messages');
      }
      const data = await response.json();
      return messagesSchema.parse(data);
    },
    retry: false,
  });

  const archetypeGroups = useMemo(() => {
    if (!data?.messages) return new Map();

    const groups = new Map<string, Message[]>();

    for (const msg of data.messages) {
      const archetype = msg.archetype.archetype;
      if (!groups.has(archetype)) {
        groups.set(archetype, []);
      }
      groups.get(archetype)!.push(msg);
    }

    // Sort by count descending
    return new Map(
      Array.from(groups.entries())
        .sort(([, a], [, b]) => b.length - a.length),
    );
  }, [data]);

  // Process data for chart - group by date and archetype
  const chartData = useMemo(() => {
    if (!data?.messages) return [];

    // Filter messages within chartDays range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - chartDays);

    const filteredMessages = data.messages.filter((msg) => {
      if (!msg.datetime) return false;
      return new Date(msg.datetime) >= cutoffDate;
    });

    // Group by date
    const dateGroups = new Map<string, Map<string, number>>();

    for (const msg of filteredMessages) {
      if (!msg.datetime) continue;

      const date = new Date(msg.datetime).toLocaleDateString('es-CL', {
        month: 'short',
        day: 'numeric',
      });
      const archetype = msg.archetype.archetype;

      if (!dateGroups.has(date)) {
        dateGroups.set(date, new Map());
      }

      const archetypeCounts = dateGroups.get(date)!;
      archetypeCounts.set(archetype, (archetypeCounts.get(archetype) || 0) + 1);
    }

    // Get top 10 archetypes by total count
    const archetypeTotals = new Map<string, number>();
    for (const archetypeCounts of dateGroups.values()) {
      for (const [archetype, count] of archetypeCounts.entries()) {
        archetypeTotals.set(archetype, (archetypeTotals.get(archetype) || 0) + count);
      }
    }

    const topArchetypes = Array.from(archetypeTotals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10) // Show top 10 archetypes instead of 5
      .map(([archetype]) => archetype);

    // Convert to chart format
    return Array.from(dateGroups.entries())
      .map(([date, archetypeCounts]) => {
        const dataPoint: Record<string, string | number> = { date };
        for (const archetype of topArchetypes) {
          dataPoint[archetype] = archetypeCounts.get(archetype) || 0;
        }
        return dataPoint;
      })
      .slice(-chartDays); // Limit to chartDays data points
  }, [data, chartDays]);

  const formatDate = (datetime: string | null) => {
    if (!datetime) return '';
    const date = new Date(datetime);
    return date.toLocaleDateString('es-CL', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getArchetypeColor = (archetype: string) => {
    if (archetype === 'Sin Asignar') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    if (archetype.includes('Reembolso')) return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    if (archetype.includes('Pago')) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    if (archetype.includes('Integración') || archetype.includes('Técnica')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
    if (archetype.includes('Ayuda') || archetype.includes('Soporte')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    if (archetype.includes('Merchant')) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    if (archetype.includes('Configuración') || archetype.includes('Credenciales')) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300';
    return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  };

  return (
    <div className="min-h-screen relative" style={{
      background: isDarkMode
        ? '#000000'
        : 'radial-gradient(circle at bottom left, rgba(0, 69, 215, 0.15) 0%, rgba(0, 69, 215, 0.015) 50%, #F6F7F8 80%)'
    }}>
      <TigerNav />
      <main className="mx-auto w-full max-w-[1400px] px-6 py-8 relative z-10">
        {/* Modern Header with German flag accent */}
        <div className="mb-8 bg-white dark:bg-zinc-900 rounded shadow-sm border-b-4" style={{
          borderBottomColor: 'transparent',
          borderImage: 'linear-gradient(to right, #000000 33%, #DD0000 33%, #DD0000 66%, #FFCE00 66%) 1'
        }}>
          <div className="px-6 py-6 flex items-center justify-between">
            {/* Left - Logo and Title */}
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 rounded overflow-hidden shadow-md border border-gray-200 dark:border-gray-700">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-red-900 to-amber-600 opacity-20"></div>
                <div className="relative flex h-full w-full items-center justify-center bg-zinc-900">
                  <Image
                    src="/assets/resized-image.png"
                    alt="Tiger I"
                    width={48}
                    height={48}
                    className="object-cover"
                  />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                  Tiger I
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Slack Operations Dashboard
                </p>
              </div>
            </div>

            {/* Right - User and Actions */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400 hidden md:block">
                {user.email}
              </span>
              <Link href="/tiger/archetipos">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Arquetipos
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleDarkMode}
                className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {data?.messages && data.messages.length > 0 && (
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Total Mensajes
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {data.messages.length.toLocaleString()}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Hash className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Arquetipos
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {archetypeGroups.size}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Canal
                    </p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white font-mono">
                      {data.channel || channelId}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controls */}
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-4 flex items-center gap-3">
              <Hash className="h-5 w-5 text-gray-400 shrink-0" />
              <span className="text-sm font-semibold shrink-0">Canal</span>
              <Input
                type="text"
                placeholder="ID del canal"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="flex-1 font-mono text-sm h-9 border-gray-200"
              />
              <Button
                onClick={() => refetch()}
                disabled={isFetching || isSyncing}
                variant="outline"
                size="sm"
                className="shrink-0 rounded-sm h-8 w-8 p-0"
                title="Refrescar desde DB"
              >
                <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={syncMessages}
                disabled={isSyncing || isFetching}
                variant="default"
                size="sm"
                className="shrink-0 rounded-sm h-8 px-3"
                title="Sincronizar desde Slack"
              >
                <Download className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-bounce' : ''}`} />
                <span className="text-xs">Sync</span>
              </Button>
              {syncStats && (
                <span className="text-xs text-green-600 dark:text-green-400 shrink-0">
                  +{syncStats.newMessages} nuevos
                </span>
              )}
              {data?.channel && (
                <span className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0">
                  {data.messages.length}
                  {' '}
                  msg
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
              <span className="text-sm font-semibold shrink-0">Última actualización</span>
              {data?.messages && (
                <span className="text-sm text-gray-600 dark:text-gray-300 ml-auto">
                  {new Date().toLocaleString('es-ES', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })}
                </span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Chart */}
        {data?.messages && data.messages.length > 0 && (
          <Card className="mb-8 border-0 shadow-sm bg-white dark:bg-zinc-900">
            <CardHeader className="p-6">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsChartOpen(!isChartOpen)}>
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  <CardTitle className="text-lg font-semibold">Tendencia de Arquetipos</CardTitle>
                  {isChartOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </div>
                {isChartOpen && (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {[7, 14, 30, 60, 90].map((days) => (
                      <Button
                        key={days}
                        variant={chartDays === days ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setChartDays(days)}
                        className="rounded-sm h-7 text-xs"
                      >
                        {days}
                        d
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {isChartOpen && chartData.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {Object.keys(chartData[0])
                    .filter((key) => key !== 'date')
                    .map((archetype, index) => {
                      const color = CHART_COLORS[index % CHART_COLORS.length];
                      const isHidden = hiddenArchetypes.has(archetype);
                      return (
                        <button
                          key={archetype}
                          onClick={() => toggleArchetype(archetype)}
                          className={`px-2 py-1 rounded-sm text-xs font-medium transition-all ${
                            isHidden
                              ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-600 line-through'
                              : 'text-white'
                          }`}
                          style={{
                            backgroundColor: isHidden ? undefined : color,
                          }}
                        >
                          {archetype}
                        </button>
                      );
                    })}
                </div>
              )}
            </CardHeader>
            {isChartOpen && (
              <CardContent className="pt-0">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        {chartData.length > 0 && Object.keys(chartData[0])
                          .filter((key) => key !== 'date')
                          .map((archetype, index) => {
                            const color = CHART_COLORS[index % CHART_COLORS.length];
                            return (
                              <linearGradient key={`gradient-${archetype}`} id={`color-${index}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                              </linearGradient>
                            );
                          })}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                      <XAxis
                        dataKey="date"
                        className="text-xs text-zinc-600 dark:text-zinc-400"
                        tick={{ fill: 'currentColor' }}
                      />
                      <YAxis
                        className="text-xs text-zinc-600 dark:text-zinc-400"
                        tick={{ fill: 'currentColor' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: '0.25rem',
                        }}
                      />
                      <Legend />
                      {chartData.length > 0 && Object.keys(chartData[0])
                        .filter((key) => key !== 'date' && !hiddenArchetypes.has(key))
                        .map((archetype) => {
                          // Get original index to maintain color consistency
                          const originalIndex = Object.keys(chartData[0])
                            .filter((key) => key !== 'date')
                            .indexOf(archetype);
                          const color = CHART_COLORS[originalIndex % CHART_COLORS.length];
                          return (
                            <Area
                              key={archetype}
                              type="monotone"
                              dataKey={archetype}
                              stroke={color}
                              strokeWidth={2}
                              fill={`url(#color-${originalIndex})`}
                              name={archetype}
                            />
                          );
                        })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Loading / Error States */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <RefreshCw className="mx-auto h-12 w-12 animate-spin text-zinc-400 mb-4" />
              <p className="text-zinc-500">Analizando mensajes...</p>
            </div>
          </div>
        )}

        {error && (
          <Card className="border-2 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardContent className="py-8">
              <p className="text-center text-red-700 dark:text-red-400">
                {error instanceof Error ? error.message : 'Error al cargar mensajes'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Archetype Grid */}
        {data?.messages && data.messages.length > 0 && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Arquetipos de Mensajes
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mt-1">
                Click en una tarjeta para ver la línea temporal y detalles
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from(archetypeGroups.entries()).map(([archetype, messages]) => (
                <Card
                  key={archetype}
                  className="border rounded-md hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]"
                  onClick={() => setSelectedArchetype({ name: archetype, messages })}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg leading-tight">
                        {archetype}
                      </CardTitle>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <div className="text-3xl font-black text-zinc-900 dark:text-zinc-100">
                          {messages.length}
                        </div>
                        <span className="text-xs text-zinc-500">mensajes</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`inline-block rounded-sm px-3 py-1 text-sm font-semibold ${getArchetypeColor(archetype)}`}>
                      {archetype === 'Sin Asignar' ? 'Por revisar' : 'Detectado'}
                    </div>
                    {messages.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Categorías predominantes:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {Array.from<string>(new Set(messages.map((m: Message) => m.category.group))).slice(0, 3).map((cat) => (
                            <span key={cat} className="text-xs px-2 py-0.5 rounded-sm bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Correction Dialog */}
        <Dialog open={!!correctionMessage} onOpenChange={() => setCorrectionMessage(null)}>
          <DialogContent className="!max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Corregir Clasificación</DialogTitle>
            </DialogHeader>

            {correctionMessage && (
              <div className="space-y-4 mt-4">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    Mensaje actual:
                  </p>
                  <div className="text-sm bg-zinc-50 dark:bg-zinc-900 p-3 rounded-sm border">
                    {correctionMessage.text.substring(0, 200)}
                    {correctionMessage.text.length > 200 && '...'}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    Arquetipo actual:
                    {' '}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {correctionMessage.archetype.archetype}
                    </span>
                    {' '}
                    <span className={`text-xs px-2 py-0.5 rounded-sm ${
                      correctionMessage.archetype.confidence === 'high'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : correctionMessage.archetype.confidence === 'medium'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {correctionMessage.archetype.confidence}
                    </span>
                  </p>
                </div>

                <div>
                  <label htmlFor="new-archetype" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 block">
                    Nuevo arquetipo
                  </label>
                  <Input
                    id="new-archetype"
                    type="text"
                    placeholder="Ej: Solicitud de Reembolso"
                    value={newArchetype}
                    onChange={(e) => setNewArchetype(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      id="add-to-manual"
                      checked={addToManual}
                      onChange={(e) => setAddToManual(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="add-to-manual" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Agregar a arquetipos manuales
                    </label>
                  </div>

                  {addToManual && (
                    <div>
                      <label htmlFor="keywords" className="text-sm text-zinc-600 dark:text-zinc-400 mb-2 block">
                        Keywords (separadas por comas)
                      </label>
                      <Input
                        id="keywords"
                        type="text"
                        placeholder="Ej: reembolso, refund, devolver"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        className="w-full"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Estos keywords se usarán para clasificar futuros mensajes automáticamente
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCorrectionMessage(null)}
                    disabled={isCorrectingArchetype}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={correctArchetype}
                    disabled={isCorrectingArchetype || !newArchetype.trim()}
                  >
                    {isCorrectingArchetype ? 'Guardando...' : 'Guardar Corrección'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Archetype Detail Dialog */}
        <Dialog open={!!selectedArchetype} onOpenChange={() => setSelectedArchetype(null)}>
          <DialogContent className="!max-w-[1600px] !w-[90vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-3">
                <span>{selectedArchetype?.name}</span>
                <span className="text-lg font-normal text-zinc-500">
                  (
                  {selectedArchetype?.messages.length}
                  {' '}
                  mensajes)
                </span>
              </DialogTitle>
            </DialogHeader>

            {selectedArchetype && (
              <div className="space-y-6 mt-6">
                {/* Timeline */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Línea Temporal
                  </h3>
                  <div className="relative pl-8 space-y-4">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-zinc-300 dark:bg-zinc-700" />
                    {selectedArchetype.messages
                      .sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''))
                      .map((msg) => (
                        <div key={msg.id} className="relative">
                          <div className="absolute -left-5 mt-1.5 h-4 w-4 rounded-sm bg-blue-500 border-2 border-white dark:border-zinc-900" />
                          <Card className="border rounded-md">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {msg.user.isBot && (
                                      <span className="text-xs px-2 py-0.5 rounded-sm bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                        BOT
                                      </span>
                                    )}
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                      {msg.user.name}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-sm bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                      {msg.category.group}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-sm ${
                                      msg.archetype.confidence === 'high'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                        : msg.archetype.confidence === 'medium'
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                    }`}>
                                      {msg.archetype.confidence}
                                    </span>
                                  </div>
                                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {msg.summary}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <time className="text-xs text-zinc-500">
                                    {formatDate(msg.datetime)}
                                  </time>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCorrectionMessage(msg);
                                      setNewArchetype('');
                                      setKeywords('');
                                      setAddToManual(false);
                                    }}
                                    className="h-7 px-2"
                                  >
                                    <EditIcon className="h-3 w-3 mr-1" />
                                    Corregir
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      ignoreMessage(msg.id);
                                    }}
                                    className="h-7 px-2"
                                    title="Ignorar mensaje (no aparecerá en el dashboard)"
                                  >
                                    <EyeOff className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-sm break-words whitespace-pre-wrap overflow-wrap-anywhere">
                                {msg.text}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <div className="mt-12 flex justify-center">
          <Link
            href="/"
            className="rounded-sm border border-zinc-300 px-8 py-3 text-base font-semibold transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            ← Volver al Base
          </Link>
        </div>
      </main>
    </div>
  );
}
