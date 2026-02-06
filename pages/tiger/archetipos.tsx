import { useState } from 'react';
import Link from 'next/link';
import type { InferGetServerSidePropsType } from 'next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import { Plus, Edit, Trash2, RefreshCw, ArrowLeft, Save, X } from 'lucide-react';
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

const archetypesSchema = z.object({
  archetypes: z.array(z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    keywords: z.array(z.string()),
    exampleMessageIds: z.array(z.string()).nullable(),
    priority: z.number(),
  })),
});

type Archetype = z.infer<typeof archetypesSchema>['archetypes'][number];

export const getServerSideProps = requireAuth(async (_ctx, session) => ({
  props: {
    user: serializeUser(session.user),
  },
}));

export default function ArchetypesManagementPage({ user }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingArchetype, setEditingArchetype] = useState<Archetype | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [reclassifyStats, setReclassifyStats] = useState<{ updated: number } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formPriority, setFormPriority] = useState('100');

  // Fetch archetypes
  const { data, isLoading, error } = useQuery({
    queryKey: ['manual-archetypes'],
    queryFn: async () => {
      const response = await fetch('/api/archetypes');
      if (!response.ok) {
        throw new Error('Failed to fetch archetypes');
      }
      const data = await response.json();
      return archetypesSchema.parse(data);
    },
  });

  // Create archetype mutation
  const createMutation = useMutation({
    mutationFn: async (archetype: {
      name: string;
      description: string;
      keywords: string[];
      priority: number;
    }) => {
      const response = await fetch('/api/archetypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(archetype),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create archetype');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-archetypes'] });
      resetForm();
      setIsCreating(false);
    },
  });

  // Update archetype mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...archetype }: {
      id: number;
      name: string;
      description: string;
      keywords: string[];
      priority: number;
    }) => {
      const response = await fetch(`/api/archetypes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(archetype),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update archetype');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-archetypes'] });
      resetForm();
      setEditingArchetype(null);
    },
  });

  // Delete archetype mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/archetypes/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete archetype');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual-archetypes'] });
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormKeywords('');
    setFormPriority('100');
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreating(true);
  };

  const openEditDialog = (archetype: Archetype) => {
    setFormName(archetype.name);
    setFormDescription(archetype.description);
    setFormKeywords(archetype.keywords.join(', '));
    setFormPriority(archetype.priority.toString());
    setEditingArchetype(archetype);
  };

  const handleSubmit = async () => {
    const keywords = formKeywords.split(',').map(k => k.trim()).filter(Boolean);

    if (!formName.trim() || !formDescription.trim() || keywords.length === 0) {
      alert('Por favor completa todos los campos y agrega al menos un keyword');
      return;
    }

    const archetypeData = {
      name: formName.trim(),
      description: formDescription.trim(),
      keywords,
      priority: parseInt(formPriority, 10),
    };

    if (editingArchetype) {
      await updateMutation.mutateAsync({ id: editingArchetype.id, ...archetypeData });
      // Trigger reclassification after update
      await reclassifyMessages(editingArchetype.id);
    } else {
      const result = await createMutation.mutateAsync(archetypeData);
      // Trigger reclassification after creation
      if (result.archetype?.id) {
        await reclassifyMessages(result.archetype.id);
      }
    }
  };

  const reclassifyMessages = async (archetypeId?: number) => {
    setIsReclassifying(true);
    setReclassifyStats(null);

    try {
      const params = new URLSearchParams();
      if (archetypeId) {
        params.set('archetypeId', archetypeId.toString());
      }

      const response = await fetch(`/api/archetypes/reclassify?${params.toString()}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reclassify messages');
      }

      const result = await response.json();
      setReclassifyStats({ updated: result.updated });

      // Refresh archetypes after reclassification
      queryClient.invalidateQueries({ queryKey: ['manual-archetypes'] });
      queryClient.invalidateQueries({ queryKey: ['slack-messages-30d'] });
    } catch (error) {
      console.error('Reclassification error:', error);
      alert('Error al reclasificar mensajes');
    } finally {
      setIsReclassifying(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar el arquetipo "${name}"?`)) {
      return;
    }

    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="min-h-screen bg-background">
      <TigerNav />
      <main className="mx-auto w-full max-w-[1400px] px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/tiger">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a Tiger
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Gestión de Arquetipos Manuales
          </h1>
          <p className="text-muted-foreground">
            Define arquetipos personalizados que tendrán prioridad sobre la clasificación automática de BERT
          </p>
        </div>

        {/* Actions */}
        <div className="mb-6 flex gap-3">
          <Button onClick={openCreateDialog} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Arquetipo
          </Button>
          <Button
            variant="outline"
            onClick={() => reclassifyMessages()}
            disabled={isReclassifying}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isReclassifying ? 'animate-spin' : ''}`} />
            Reclasificar Todos
          </Button>
          {reclassifyStats && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center">
              ✓ {reclassifyStats.updated} mensajes actualizados
            </span>
          )}
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardContent className="py-8">
              <p className="text-center text-red-700 dark:text-red-400">
                {error instanceof Error ? error.message : 'Error al cargar arquetipos'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Archetypes List */}
        {data && data.archetypes.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No hay arquetipos manuales definidos
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Arquetipo
              </Button>
            </CardContent>
          </Card>
        )}

        {data && data.archetypes.length > 0 && (
          <div className="space-y-4">
            {data.archetypes.map((archetype) => (
              <Card key={archetype.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{archetype.name}</CardTitle>
                        <span className="text-xs px-2 py-1 rounded-sm bg-primary/10 text-primary">
                          Prioridad: {archetype.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {archetype.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(archetype)}
                        disabled={updateMutation.isPending}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(archetype.id, archetype.name)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Keywords:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {archetype.keywords.map((keyword, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 rounded-sm bg-muted text-foreground"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isCreating || !!editingArchetype} onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            setEditingArchetype(null);
            resetForm();
          }
        }}>
          <DialogContent className="!max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingArchetype ? 'Editar Arquetipo' : 'Crear Arquetipo'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <label htmlFor="name" className="text-sm font-semibold text-foreground mb-2 block">
                  Nombre del Arquetipo
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ej: Solicitud de Reembolso"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="description" className="text-sm font-semibold text-foreground mb-2 block">
                  Descripción
                </label>
                <Input
                  id="description"
                  type="text"
                  placeholder="Describe qué tipo de mensajes incluye este arquetipo"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="keywords" className="text-sm font-semibold text-foreground mb-2 block">
                  Keywords (separados por comas)
                </label>
                <Input
                  id="keywords"
                  type="text"
                  placeholder="Ej: reembolso, refund, devolver, cancelar pago"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Los mensajes que contengan cualquiera de estos keywords serán clasificados con este arquetipo
                </p>
              </div>

              <div>
                <label htmlFor="priority" className="text-sm font-semibold text-foreground mb-2 block">
                  Prioridad (mayor = se revisa primero)
                </label>
                <Input
                  id="priority"
                  type="number"
                  min="0"
                  max="1000"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Arquetipos con mayor prioridad se revisan antes en caso de coincidencias múltiples
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingArchetype(null);
                    resetForm();
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {editingArchetype ? 'Guardar Cambios' : 'Crear Arquetipo'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
