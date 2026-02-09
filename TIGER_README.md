# Tiger I - Operations Dashboard

## 📋 Resumen Ejecutivo

Tiger I es un dashboard de operaciones interno que analiza mensajes de Slack del canal de soporte, clasifica automáticamente los temas usando Claude AI, y genera documentación operativa desde threads de Slack.

**Propósito**: Ayudar al equipo de operaciones a identificar patrones en solicitudes de soporte, generar runbooks desde resoluciones exitosas, y tener visibilidad de arquetipos de problemas recurrentes.

---

## 🏗️ Arquitectura

### Stack Tecnológico

- **Frontend**: Next.js 15 (Pages Router) + React + TypeScript
- **Backend**: Next.js API Routes (serverless)
- **Base de Datos**: PostgreSQL (Supabase en producción)
- **ORM**: Drizzle ORM
- **Autenticación**: BetterAuth
- **UI**: shadcn/ui + Tailwind CSS v4
- **AI**: Anthropic Claude API (claude-sonnet-4-5-20250929)
- **Integraciones**: Slack API (Events API + Web API)
- **Runtime**: Bun (desarrollo y scripts)
- **Deployment**: Vercel (producción)

### Flujo de Datos

```
Slack Channel → Webhook → Next.js API → Claude AI → PostgreSQL → Dashboard UI
                    ↓
                 Bot TigerI (responde en Slack)
```

---

## 🔐 Acceso a Información

### Datos de Slack

**Canal Monitoreado**: `#tiger-ops` (configurable via `SLACK_CHANNEL_ID`)

**Información Accedida**:
- Mensajes públicos del canal de operaciones
- Metadata de usuarios (nombre, ID, si es bot)
- Timestamps de mensajes
- Estructura de threads (replies)
- NO accede a mensajes directos privados
- NO accede a otros canales sin permiso explícito

**Scopes de Slack**:
```
- app_mentions:read      # Detectar cuando mencionan @TigerI
- channels:history       # Leer historial del canal
- chat:write            # Responder mensajes
- users:read            # Obtener info de usuarios
- files:read            # Leer archivos compartidos
```

### Datos Almacenados en Base de Datos

**Tabla: `slack_messages`**
```sql
- id (string): Slack message ID
- text (string): Contenido del mensaje
- raw_text (string): Texto sin formato
- user_id (string): Slack user ID
- timestamp (string): Slack timestamp
- datetime (timestamp): Fecha/hora del mensaje
- channel_id (string): ID del canal
- thread_ts (string): Thread parent timestamp
- is_thread_reply (boolean): Si es respuesta en thread
- type (string): reminder | bot | user
- category_role (string): support | kam | merchant | bot | unknown
- archetype (string): Clasificación del arquetipo
- archetype_confidence (string): Nivel de confianza
- summary (text): Resumen generado
- is_ignored (boolean): Si está ignorado
```

**Tabla: `slack_users`**
```sql
- id (string): Slack user ID
- name (string): Nombre de usuario
- real_name (string): Nombre real
- is_bot (boolean): Si es bot
```

**Tabla: `manual_archetypes`**
```sql
- id (number): ID del arquetipo
- name (string): Nombre del arquetipo
- description (text): Descripción detallada
- keywords (array): Keywords para clasificación
- priority (number): Prioridad de clasificación
- example_message_ids (array): IDs de mensajes ejemplo
```

**Tabla: `runbooks`**
```sql
- id (number): ID del runbook
- title (string): Título del documento
- content (text): Contenido en markdown
- thread_ts (string): Thread de origen en Slack
- channel_id (string): Canal de origen
- created_by (string): Usuario que lo creó
- created_at (timestamp): Fecha de creación
- updated_at (timestamp): Última actualización
```

---

## 🤖 Uso de Claude AI

### Llamadas a la API de Anthropic

**Modelo**: `claude-sonnet-4-5-20250929`

**Casos de Uso**:

1. **Clasificación de Intención** (Slack Bot)
   - **Input**: Mensaje de usuario mencionando @TigerI
   - **Output**: JSON con acción (escribir/leer/none) y parámetros
   - **Tokens**: ~200 por clasificación
   - **Frecuencia**: Solo cuando mencionan al bot

2. **Generación de Runbooks**
   - **Input**: Thread completo de Slack + instrucciones opcionales
   - **Output**: Documento markdown estructurado
   - **Tokens**: ~2,000-5,000 por runbook
   - **Frecuencia**: Bajo demanda (cuando usuario pide "escribe un runbook")

3. **Clasificación Batch de Mensajes** (Script offline)
   - **Input**: Batch de 50 mensajes + lista de arquetipos
   - **Output**: Clasificación de cada mensaje
   - **Tokens**: ~1,000 por batch
   - **Frecuencia**: Solo cuando se ejecuta script manualmente

**Información Enviada a Claude**:
- Contenido de mensajes de Slack (texto público del canal)
- Contexto de threads (para runbooks)
- Lista de arquetipos existentes (para clasificación)
- NO se envían mensajes privados
- NO se envían datos sensibles de clientes (los mensajes son de operaciones internas)

**Costo Estimado**:
- Clasificación de mensajes: ~$0.01 por 1000 mensajes
- Generación de runbooks: ~$0.03 por runbook
- Costo mensual estimado: ~$5-10 (bajo volumen)

---

## 🔒 Consideraciones de Seguridad

### Autenticación y Autorización

- **Acceso al Dashboard**: Requiere autenticación via BetterAuth
- **Usuarios Permitidos**: Solo empleados internos con email @fintoc.com
- **Slack Webhooks**: Verificados con `SLACK_SIGNING_SECRET`
- **API Keys**: Almacenadas en variables de entorno, nunca en código

### Variables de Entorno (Sensibles)

```bash
DATABASE_URL              # Connection string de PostgreSQL
ANTHROPIC_API_KEY        # API key de Claude
SLACK_SIGNING_SECRET     # Para verificar webhooks
SLACK_BOT_TOKEN         # OAuth token del bot
SLACK_CHANNEL_ID        # ID del canal monitoreado
BETTER_AUTH_SECRET      # Secret para sesiones
BETTER_AUTH_URL         # URL base de la app
```

### Protecciones Implementadas

1. **Webhook Verification**: Todos los webhooks de Slack son verificados con signature
2. **Rate Limiting**: Claude API tiene rate limits naturales (~50 requests/min)
3. **Message Deduplication**: Eventos duplicados de Slack son ignorados
4. **Protected Routes**: Todas las rutas de API usan `protectedHandler`
5. **Input Validation**: Zod schemas validan todos los inputs
6. **SQL Injection Protection**: Drizzle ORM previene inyecciones
7. **XSS Protection**: React escapa contenido por defecto
8. **HTTPS Only**: Producción solo acepta HTTPS

### Datos NO Expuestos

- Mensajes de canales privados
- DMs entre usuarios
- Datos de clientes o merchants
- Información financiera
- Credenciales o API keys de terceros

---

## 📊 Funcionalidades Principales

### 1. Dashboard de Operaciones (`/tiger`)

**Qué hace**:
- Muestra mensajes del canal de Slack clasificados por arquetipo
- Visualiza distribución de arquetipos en gráficos (área, barras, 100%)
- Permite filtrar por días (7, 30, 90)
- Permite ocultar arquetipos específicos del análisis
- Permite mover mensajes entre arquetipos (corrección manual)
- Permite ignorar mensajes irrelevantes

**Data Sources**:
- Lee de `slack_messages` y `slack_users` en PostgreSQL
- Sincroniza desde Slack API cuando usuario hace "Sync"

### 2. Gestión de Arquetipos (`/tiger/arquetipos`)

**Qué hace**:
- Lista todos los arquetipos manuales creados
- Permite crear/editar/eliminar arquetipos
- Cada arquetipo tiene: nombre, descripción, keywords, prioridad
- Botón "Reclasificar Todos" re-clasifica mensajes con Claude

**Data Sources**:
- Lee de `manual_archetypes` en PostgreSQL
- Llama a Claude API para reclasificación

### 3. Runbooks (`/tiger/runbooks`)

**Qué hace**:
- Lista todos los runbooks/documentos generados
- Muestra documentación en markdown con formato
- Permite ver el thread de origen en Slack

**Data Sources**:
- Lee de `runbooks` en PostgreSQL
- Contenido generado por Claude desde threads de Slack

### 4. Bot de Slack (TigerI)

**Qué hace**:
- Responde cuando lo mencionan con `@TigerI`
- Detecta intención: escribir documentación o leer docs existentes
- Genera runbooks desde threads de Slack
- Responde en el mismo thread

**Comandos**:
```
@TigerI escribe un runbook de esto
@TigerI documenta esta resolución
@TigerI haz un resumen de este thread
@TigerI lee la documentación de X (futuro)
```

---

## 🔄 Flujos de Trabajo

### Flujo 1: Clasificación Automática de Mensajes

```
1. Slack envía evento nuevo mensaje → /api/slack/events
2. Sistema guarda mensaje en DB como "Sin Clasificar"
3. Background job clasifica con Claude (opcional)
4. Dashboard muestra mensaje clasificado
```

### Flujo 2: Generación de Runbook desde Slack

```
1. Usuario menciona @TigerI en thread: "escribe un runbook"
2. Webhook llega a /api/slack/events
3. Claude clasifica intención → "escribir"
4. Sistema lee todo el thread desde Slack API
5. Claude genera runbook estructurado
6. Sistema guarda en DB tabla runbooks
7. Bot responde en Slack con link al dashboard
```

### Flujo 3: Sincronización Manual

```
1. Usuario click "Sync" en dashboard
2. Dashboard llama /api/slack/sync
3. API descarga últimos 90 días desde Slack
4. Guarda mensajes nuevos en DB
5. Retorna estadísticas (nuevos, actualizados)
6. Dashboard refresca vista
```

---

## 🚀 Deployment y Configuración

### Desarrollo Local

```bash
# 1. Instalar dependencias
bun install

# 2. Levantar PostgreSQL
docker compose up

# 3. Correr migraciones
bun run db:migrate

# 4. Seed de arquetipos
bun run scripts/seed-archetypes-production.ts

# 5. Iniciar dev server
bun run dev
```

### Producción (Vercel)

**Pre-requisitos**:
1. Proyecto Vercel conectado a GitHub
2. PostgreSQL en Supabase
3. Todas las env vars configuradas en Vercel
4. Slack App configurada con webhook URL de producción

**Webhook URL**: `https://your-domain.vercel.app/api/slack/events`

---

## 📈 Métricas y Monitoreo

### Datos Actuales

- **Mensajes Clasificados**: 1,317 mensajes principales
- **Arquetipos Descubiertos**: 15 arquetipos activos
- **Runbooks Generados**: ~5-10 por semana (estimado)
- **Usuarios del Dashboard**: Team de Ops (~5-8 personas)

### Logs y Debugging

- Logs de Slack webhook en `/api/slack/events`
- Logs de generación de runbooks en `/api/runbooks/generate-internal`
- Vercel logs en dashboard de Vercel
- PostgreSQL logs en Supabase

---

## 🔧 Scripts de Mantenimiento

### Clasificación Batch de Mensajes

```bash
bun run scripts/classify_all_messages.py
```

**Qué hace**: Re-clasifica TODOS los mensajes usando Claude y arquetipos actuales
**Cuándo usar**: Después de modificar arquetipos o agregar nuevos
**Costo**: ~$1-3 por ejecución completa

### Verificación Pre-Deploy

```bash
bun run scripts/verify-deploy-ready.ts
```

**Qué hace**: Verifica que todo esté listo para production:
- Conexión a DB
- Arquetipos cargados (espera 15)
- Variables de entorno configuradas
- Archivos de configuración presentes

---

## 🤝 Equipo y Responsables

**Desarrollador Principal**: Raimundo Sandoval (@raimundo.sandoval)
**Product Owner**: TBD
**Usuarios**: Equipo de Operaciones de Fintoc

---

## 📝 Convenciones de Código

### Git Commits

```
feat: descripción del feature
fix: descripción del fix
refactor: descripción del refactor
docs: actualización de documentación
chore: tareas de mantenimiento
```

### Branch Strategy

- `main`: Rama de producción (protegida)
- `feat/*`: Features nuevos
- `fix/*`: Bug fixes
- `refactor/*`: Refactorings

**Protecciones de `main`**:
- Requiere Pull Request
- Requiere 1 aprobación de Code Owner
- Requiere review de Code Owners
- No permite bypass (ni admin)

---

## ⚠️ Riesgos y Limitaciones

### Riesgos

1. **Exposición de Info Operativa**: Mensajes del canal pueden contener info sensible de operaciones
   - **Mitigación**: Solo usuarios autenticados @fintoc.com pueden ver dashboard

2. **Costo de Claude API**: Si volumen aumenta mucho, costos pueden subir
   - **Mitigación**: Rate limiting y clasificación batch (no en tiempo real)

3. **Dependencia de Slack**: Si Slack cae, no hay nuevos datos
   - **Mitigación**: Sistema funciona con datos históricos en DB

4. **Calidad de Clasificación**: Claude puede clasificar mal algunos mensajes
   - **Mitigación**: Corrección manual disponible en dashboard

### Limitaciones

- Solo monitorea 1 canal de Slack (configurable)
- Clasificación no es en tiempo real (es bajo demanda)
- Runbooks requieren intervención humana para generarse
- No tiene búsqueda full-text de runbooks (futuro)

---

## 🔮 Roadmap Futuro

### En Desarrollo

- [ ] Función "leer" del bot (buscar docs existentes)
- [ ] Búsqueda full-text de runbooks
- [ ] Export de runbooks a Notion/Confluence
- [ ] Dashboard de métricas de arquetipos en el tiempo

### Ideas Futuras

- [ ] Multi-canal (monitorear múltiples canales)
- [ ] Alertas automáticas de arquetipos críticos
- [ ] Integración con sistema de tickets
- [ ] ML para detección de urgencia de mensajes

---

## 📞 Contacto y Soporte

**Repositorio**: https://github.com/fintoc-com/vibe-template
**Branch Actual**: `feat/tiger-slack-integration`
**Documentación Adicional**:
- `DEPLOY_CHECKLIST.md` - Checklist completo de deployment
- `GITHUB_BRANCH_PROTECTION.md` - Guía de protecciones de GitHub
- `AGENTS.md` - Documentación del stack técnico

**Para Preguntas**:
- Development Advocate: [email/slack]
- Safety Team: [email/slack]
- Ops Team: [canal de Slack]

---

## ✅ Certificación de Seguridad

**Revisado por**: [Pendiente]
**Fecha**: [Pendiente]
**Aprobado para Producción**: [Pendiente]

---

**Última actualización**: 2025-02-09
**Versión**: 1.0
**Status**: En desarrollo (branch feat/tiger-slack-integration)
