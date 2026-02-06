# 🚀 Guía de Deployment a Producción

## Stack
- **Frontend/Backend**: Vercel (Next.js)
- **Database**: Supabase (Postgres)
- **Clasificación**: Claude API
- **Cron**: Vercel Cron
- **Slack**: Webhook

## 📋 Prerrequisitos

### 1. Cuenta Supabase
1. Ve a https://supabase.com/
2. Crea cuenta gratuita
3. Crea nuevo proyecto "tiger-slack"
4. Copia el `DATABASE_URL` (Settings → Database → Connection string → URI)

### 2. Cuenta Vercel
1. Ve a https://vercel.com/
2. Crea cuenta gratuita (conecta con GitHub)
3. Instala Vercel CLI: `npm i -g vercel`

## 🗄️ Paso 1: Migrar Base de Datos

```bash
# 1. Actualiza .env con Supabase URL
DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres

# 2. Genera y aplica migraciones
bun run db:generate
bun run db:migrate

# 3. Verifica tablas
# Abre Supabase Dashboard → Table Editor
# Deberías ver: slack_messages, manual_archetypes, runbooks, etc.
```

## 📊 Paso 2: Preparar Arquetipos

### Opción A: Usar arquetipos existentes
```bash
# Si ya tienes arquetipos en tu DB local
docker exec vibe-template-db-1 psql -U postgres -c "
  COPY manual_archetypes TO STDOUT WITH CSV HEADER
" > archetypes.csv

# Importar a Supabase
# Supabase Dashboard → Table Editor → manual_archetypes → Import data from CSV
```

### Opción B: Crear arquetipos desde BERTopic

```python
# analyze_corpus.py
import pandas as pd
from bertopic import BERTopic
from slack_sdk import WebClient

# 1. Descarga mensajes
client = WebClient(token="xoxb-...")
messages = []
result = client.conversations.history(
    channel="C05ADHG3WAF",
    limit=5000
)
for msg in result['messages']:
    if msg.get('text'):
        messages.append(msg['text'])

# 2. Genera tópicos
topic_model = BERTopic(language="spanish", nr_topics=15)
topics, probs = topic_model.fit_transform(messages)

# 3. Exporta
topic_info = topic_model.get_topic_info()
topic_info.to_csv('bert_topics.csv')

# 4. Manualmente crea arquetipos basándote en los tópicos
# Guarda en archetypes.json:
[
  {
    "name": "Payment Issues",
    "description": "Problemas con pagos y transacciones",
    "keywords": ["pago", "payment", "reembolso"],
    "priority": 100
  },
  ...
]
```

```bash
# Seed arquetipos a Supabase
bun run scripts/seed-archetypes.ts archetypes.json
```

## 🔑 Paso 3: Variables de Entorno en Vercel

```bash
# 1. Deploy inicial (sin env vars)
vercel

# 2. Agrega variables de entorno
vercel env add DATABASE_URL
# Pega: postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres

vercel env add BETTER_AUTH_SECRET
# Genera: openssl rand -base64 32

vercel env add SLACK_BOT_TOKEN
# xoxb-...

vercel env add SLACK_SIGNING_SECRET
# Tu signing secret de Slack

vercel env add ANTHROPIC_API_KEY
# sk-ant-...

vercel env add CRON_SECRET
# Genera: openssl rand -base64 32

vercel env add BETTER_AUTH_URL
# https://tu-proyecto.vercel.app

# 3. Deploy con variables
vercel --prod
```

## 🔗 Paso 4: Configurar Slack Webhook

```bash
# 1. Copia tu URL de Vercel
https://tiger-slack-XXXXX.vercel.app

# 2. Actualiza Slack App
# https://api.slack.com/apps → Tu App → Event Subscriptions
# Request URL: https://tiger-slack-XXXXX.vercel.app/api/slack/events

# 3. Verifica ✅
```

## ⏰ Paso 5: Verificar Cron

```bash
# El cron corre automáticamente 3x/día (8am, 2pm, 8pm)
# Para probar manualmente:
curl -X GET https://tiger-slack-XXXXX.vercel.app/api/cron/sync-messages \
  -H "Authorization: Bearer TU_CRON_SECRET"

# Verifica logs en Vercel Dashboard
```

## 👥 Paso 6: Invitar Usuarios

```bash
# 1. Vercel Dashboard → Settings → Team
# Invita colaboradores por email

# 2. En Slack:
/invite @Tiger I

# 3. Comparte URL con equipo:
https://tiger-slack-XXXXX.vercel.app/tiger
```

## 📊 Cómo Funciona

### Dashboard
```
Usuario → https://tu-app.vercel.app/tiger
         ↓
      Next.js SSR
         ↓
      Supabase (query messages)
         ↓
      Render dashboard
```

### Bot en Slack
```
Usuario menciona @Tiger I
         ↓
      Slack Webhook → Vercel
         ↓
      Claude classifica intent
         ↓
      Genera documento
         ↓
      Guarda en Supabase
         ↓
      Responde en Slack con link
```

### Cron Sync
```
3x/día (8am, 2pm, 8pm)
         ↓
      Vercel Cron → /api/cron/sync-messages
         ↓
      Fetch mensajes últimas 8h
         ↓
      Claude clasifica cada mensaje
         ↓
      Guarda en Supabase
         ↓
      Dashboard se actualiza
```

## 💰 Costos Estimados

### Stack Gratuito
- ✅ Vercel: Gratis hasta 100GB bandwidth/mes
- ✅ Supabase: Gratis hasta 500MB DB + 2GB bandwidth
- ✅ Vercel Cron: Gratis hasta 1M invocations

### APIs Pagadas
- Claude API: ~$0.003 por clasificación
- Estimado: 1000 mensajes/día × 3 syncs = 3000 clasificaciones/día
- Costo: $9/día = $270/mes

### Alternativa Barata (Embeddings)
- Voyage AI: $0.00012/1K tokens
- Estimado: 3000 mensajes/día × 100 tokens = 300K tokens/día
- Costo: $0.036/día = $1.08/mes

## 🧪 Testing en Producción

```bash
# 1. Dashboard
open https://tu-app.vercel.app/tiger

# 2. Arquetipos
open https://tu-app.vercel.app/tiger/archetipos

# 3. Runbooks
open https://tu-app.vercel.app/tiger/runbooks

# 4. Bot en Slack
# En un thread: @Tiger I crea documentación resumiendo el problema

# 5. Verifica en DB
# Supabase Dashboard → SQL Editor
SELECT COUNT(*) FROM slack_messages WHERE created_at > NOW() - INTERVAL '1 day';
```

## 🐛 Troubleshooting

### Error: "Database connection failed"
```bash
# Verifica que DATABASE_URL esté correcta en Vercel
vercel env ls

# Prueba conexión desde local
DATABASE_URL=postgresql://... bun run db:studio
```

### Error: "Slack verification failed"
```bash
# Verifica SLACK_SIGNING_SECRET en Vercel
# Debe coincidir con Slack App → Basic Information → Signing Secret
```

### Cron no corre
```bash
# Verifica que vercel.json esté en root
cat vercel.json

# Verifica en Vercel Dashboard → Settings → Cron Jobs
# Debe mostrar: /api/cron/sync-messages @ 0 8,14,20 * * *
```

## 🚀 Next Steps (Post-Beta)

1. **Agregar autenticación de usuarios**
   - BetterAuth ya está configurado
   - Agrega login con Google/email

2. **Implementar "leer" y "resumir"**
   - Ya está el routing en `/api/slack/events`
   - Solo falta implementar handlers

3. **Optimizar costos**
   - Cambiar a Voyage AI embeddings
   - Cachear clasificaciones comunes

4. **Analytics**
   - Agregar Vercel Analytics
   - Track uso del bot

5. **Alertas**
   - Vercel Log Drains → Slack
   - Notificar si cron falla
