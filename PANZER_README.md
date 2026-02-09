# Panzer - Operations Dashboard

## 📋 Resumen Ejecutivo

Panzer es un dashboard de operaciones interno que analiza mensajes de Slack del canal de soporte, clasifica automáticamente los temas usando Claude AI, y genera documentación operativa desde threads de Slack.

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
                 Bot Panzer (responde en Slack)
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
- app_mentions:read      # Detectar cuando mencionan @Panzer
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
   - **Input**: Mensaje de usuario mencionando @Panzer
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

### 1. Dashboard de Operaciones (`/panzer`)

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

### 2. Gestión de Arquetipos (`/panzer/arquetipos`)

**Qué hace**:
- Lista todos los arquetipos manuales creados
- Permite crear/editar/eliminar arquetipos
- Cada arquetipo tiene: nombre, descripción, keywords, prioridad
- Botón "Reclasificar Todos" re-clasifica mensajes con Claude

**Data Sources**:
- Lee de `manual_archetypes` en PostgreSQL
- Llama a Claude API para reclasificación

### 3. Runbooks (`/panzer/runbooks`)

**Qué hace**:
- Lista todos los runbooks/documentos generados
- Muestra documentación en markdown con formato
- Permite ver el thread de origen en Slack

**Data Sources**:
- Lee de `runbooks` en PostgreSQL
- Contenido generado por Claude desde threads de Slack

### 4. Bot de Slack (Panzer)

**Qué hace**:
- Responde cuando lo mencionan con `@Panzer`
- Detecta intención: escribir documentación o leer docs existentes
- Genera runbooks desde threads de Slack
- Responde en el mismo thread

**Comandos**:
```
@Panzer escribe un runbook de esto
@Panzer documenta esta resolución
@Panzer haz un resumen de este thread
@Panzer lee la documentación de X (futuro)
```

---

## 🔄 Flujos de Trabajo

### Flujo 1: Ingestion Automática en Tiempo Real

```
1. Nuevo mensaje en canal de Slack
2. Slack envía evento → /api/slack/events
3. Sistema guarda mensaje inmediatamente en DB como "Sin Clasificar"
4. Mensaje aparece automáticamente en el dashboard
5. Clasificación con Claude se hace bajo demanda (batch)
```

### Flujo 2: Generación de Runbook desde Slack

```
1. Usuario menciona @Panzer en thread: "escribe un runbook"
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
- Clasificación de arquetipos es bajo demanda (batch processing)
- Runbooks requieren intervención humana para generarse

---

## 🔮 Roadmap Futuro

### En Desarrollo

- [ ] Función "leer" del bot (buscar docs existentes y responder en el canal)
- [ ] Export de runbooks a Notion

---

**Última actualización**: 2025-02-09
**Versión**: 1.0
**Status**: En desarrollo (branch feat/panzer-slack-integration)
