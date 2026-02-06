# 🚀 Checklist de Deploy a Producción - Tiger I

## ✅ Pre-requisitos Completados

- [x] 88 días de mensajes históricos en DB
- [x] 15 arquetipos descubiertos con Claude
- [x] Formato de markdown mejorado

## 📋 Pasos para Deploy

### 1. Clasificar Mensajes Existentes (~$2-3, 10-15 min)

```bash
# Clasificar todos los mensajes históricos con los arquetipos
pip install anthropic  # Si no lo has instalado
python classify_all_messages.py
```

**Output esperado:**
```
✅ CLASIFICACIÓN COMPLETADA
  - Mensajes clasificados: 2,456
  - Mensajes fallidos: 0

📈 Distribución de arquetipos:
  - Alertas Automáticas de Disponibilidad Bancaria: 412
  - Alertas de Refunds y Paybacks Fallidos: 287
  - Recordatorios de Tareas Operativas Recurrentes: 365
  ...
```

### 2. Importar Arquetipos a la Base de Datos

```bash
# Seed de arquetipos para producción
bun run scripts/seed-archetypes-production.ts
```

**Output esperado:**
```
✅ SEED COMPLETADO
  - Nuevos arquetipos: 15
  - Total: 15
```

### 3. Verificar en Local

```bash
# Iniciar servidor local
bun run dev

# Abrir en navegador
open http://localhost:3000/tiger
```

**Verificar:**
- ✅ Dashboard muestra mensajes clasificados
- ✅ Tiger → Arquetipos muestra 15 arquetipos
- ✅ Mensajes tienen arquetipos asignados

### 4. Commit y Push

```bash
git add .
git commit -m "feat: add Claude-discovered archetypes and improved markdown formatting

- Add 15 production-ready archetypes from exhaustive Claude analysis
- Improve markdown document formatting (spacing, headers, bullets)
- Add classification scripts for historical messages
- Ready for production deployment

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin feat/tiger-slack-integration
```

### 5. Deploy a Vercel

```bash
# Opción A: Deploy automático desde GitHub
# (Si tienes Vercel conectado a GitHub, se deployará automáticamente)

# Opción B: Deploy manual con Vercel CLI
vercel --prod
```

### 6. Configurar Variables de Entorno en Vercel

**CRÍTICO:** Asegúrate de tener estas variables en Vercel:

```bash
# Vercel Dashboard → Settings → Environment Variables
DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres
BETTER_AUTH_URL=https://tu-proyecto.vercel.app
BETTER_AUTH_SECRET=genera-con-openssl-rand-base64-32
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=tu-signing-secret
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=genera-con-openssl-rand-base64-32
SLACK_CHANNEL_ID=C09DU6FJQTG
```

### 7. Migrar Base de Datos a Supabase (Producción)

```bash
# 1. Crea proyecto en Supabase
# https://supabase.com → Create Project

# 2. Copia DATABASE_URL de Supabase

# 3. Actualiza .env con Supabase URL
DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres

# 4. Ejecuta migraciones
bun run db:generate  # Si hay cambios nuevos
bun run db:migrate   # Aplicar a Supabase

# 5. Importa arquetipos a Supabase
bun run scripts/seed-archetypes-production.ts

# 6. Verifica en Supabase Dashboard
# Table Editor → manual_archetypes (debe tener 15 rows)
```

### 8. Actualizar Webhook de Slack

```bash
# 1. Copia tu URL de producción
https://tu-proyecto.vercel.app

# 2. Ve a https://api.slack.com/apps → Tu App → Event Subscriptions

# 3. Actualiza Request URL:
https://tu-proyecto.vercel.app/api/slack/events

# 4. Verifica que aparezca ✅ Verified
```

### 9. Verificar en Producción

**Test 1: Dashboard**
```
https://tu-proyecto.vercel.app/tiger
```
- ✅ Muestra mensajes clasificados
- ✅ Gráficos de arquetipos

**Test 2: Arquetipos**
```
https://tu-proyecto.vercel.app/tiger/archetipos
```
- ✅ Muestra 15 arquetipos
- ✅ Con keywords correctos

**Test 3: Bot en Slack**
```
# En Slack, en un thread:
@Tiger I crea documentación resumiendo el problema
```
- ✅ Bot responde
- ✅ Crea runbook con formato mejorado
- ✅ Documento tiene buen spacing y bullets

**Test 4: Cron Job (automático 3x/día)**
```
# Vercel Dashboard → Settings → Cron Jobs
# Debe mostrar: /api/cron/sync-messages @ 0 8,14,20 * * *
```

### 10. Monitoreo Post-Deploy

**Primeras 24 horas:**
- Verificar que mensajes nuevos se clasifican correctamente
- Revisar logs en Vercel para errores
- Verificar que cron ejecuta exitosamente

**Primera semana:**
- Revisar distribución de arquetipos
- Ajustar prioridades si es necesario
- Validar calidad de documentos generados

## 📊 Métricas de Éxito

- ✅ **Clasificación**: >90% de mensajes tienen arquetipo asignado
- ✅ **Precisión**: Arquetipos reflejan el contenido correctamente
- ✅ **Formato**: Documentos son legibles y bien formateados
- ✅ **Cron**: Ejecuta 3x/día sin fallos
- ✅ **Costos**: <$10/mes en Claude API

## 🔧 Troubleshooting

### Error: "Archetype not found"
- Verificar que arquetipos están en Supabase
- Re-ejecutar: `bun run scripts/seed-archetypes-production.ts`

### Mensajes no se clasifican
- Verificar ANTHROPIC_API_KEY en Vercel
- Ver logs de Vercel para errores de API

### Documentos sin formato
- Verificar que el código actualizado está en producción
- Limpiar cache de Vercel

### Cron no ejecuta
- Verificar `vercel.json` está en el repo
- Verificar CRON_SECRET en Vercel
- Ver logs en Vercel Dashboard → Deployments → Functions

## 📞 Soporte

Si algo falla:
1. Revisa logs en Vercel Dashboard
2. Verifica variables de entorno
3. Prueba endpoint directamente: `curl https://tu-app.vercel.app/api/slack/events`

## 🎯 Archivos Clave para Producción

- `claude_exhaustive_archetypes.json` - Arquetipos finales
- `scripts/seed-archetypes-production.ts` - Seed script
- `pages/api/runbooks/generate-internal.ts` - Generador mejorado
- `pages/api/slack/events.ts` - Webhook de Slack
- `pages/api/cron/sync-messages.ts` - Sync automático
- `vercel.json` - Configuración de cron

¡Listo para producción! 🚀
