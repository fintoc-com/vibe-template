# Configuración de Slack para Creación de Runbooks

Esta guía te ayudará a configurar la integración de Slack para crear runbooks automáticamente desde threads usando `@Tiger I crea el runbook`.

## 📋 Requisitos Previos

1. Acceso de administrador al workspace de Slack
2. Variables de entorno configuradas:
   - `SLACK_BOT_TOKEN` (ya lo tienes)
   - `SLACK_SIGNING_SECRET` (lo obtendrás en este proceso)
   - `ANTHROPIC_API_KEY` (agrega tu API key de Claude)
3. Tu aplicación desplegada o accesible públicamente (para el webhook)

---

## 🚀 Paso 1: Crear/Configurar Slack App

1. Ve a https://api.slack.com/apps
2. Si ya tienes una app, selecciónala. Si no:
   - Click en **"Create New App"**
   - Selecciona **"From scratch"**
   - Nombre: `Tiger I` (o el que prefieras)
   - Selecciona tu workspace
   - Click **"Create App"**

---

## 🔐 Paso 2: Obtener Signing Secret

1. En tu Slack App, ve a **"Basic Information"** (sidebar izquierdo)
2. Scroll hasta **"App Credentials"**
3. Copia el **"Signing Secret"**
4. Agrégalo a tu `.env`:
   ```bash
   SLACK_SIGNING_SECRET=abc123...
   ```

---

## 🤖 Paso 3: Configurar Bot Token Scopes

1. Ve a **"OAuth & Permissions"** (sidebar izquierdo)
2. Scroll hasta **"Scopes"** → **"Bot Token Scopes"**
3. Agrega los siguientes scopes (si no los tienes ya):
   - `app_mentions:read` - Para recibir menciones del bot
   - `chat:write` - Para enviar mensajes
   - `channels:history` - Para leer mensajes del canal
   - `groups:history` - Para canales privados
   - `users:read` - Para obtener info de usuarios
   - `conversations.replies:read` - Para leer threads

4. Si agregaste nuevos scopes, **reinstala la app** en tu workspace:
   - Scroll arriba en la misma página
   - Click **"Reinstall to Workspace"**
   - Autoriza los permisos

---

## 📡 Paso 4: Configurar Event Subscriptions

### 4.1 Exponer tu webhook públicamente

**Opción A: Desarrollo local con ngrok (recomendado para testing)**
```bash
# Instala ngrok si no lo tienes
# https://ngrok.com/download

# Inicia tu aplicación
bun run dev

# En otra terminal, expón el puerto 3000
ngrok http 3000

# Ngrok te dará una URL pública, ej:
# https://abc123.ngrok.io
```

**Opción B: Desplegar en producción**
- Despliega tu app en Vercel, Railway, etc.
- Usa la URL de producción

### 4.2 Configurar el webhook en Slack

1. Ve a **"Event Subscriptions"** (sidebar izquierdo)
2. **Enable Events** → Toggle ON
3. **Request URL**: Ingresa tu URL + `/api/slack/events`
   ```
   https://tu-dominio.com/api/slack/events
   # o
   https://abc123.ngrok.io/api/slack/events
   ```
4. Slack verificará la URL (debe mostrar ✅ "Verified")

5. Scroll a **"Subscribe to bot events"**
6. Click **"Add Bot User Event"**
7. Agrega: `app_mention`
8. Click **"Save Changes"** (abajo de la página)

---

## 🎯 Paso 5: Agregar Variables de Entorno

Actualiza tu `.env` con todas las keys necesarias:

```bash
# Slack (ya lo tienes)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=abc123...  # Nuevo desde Paso 2
SLACK_CHANNEL_ID=C123456  # Opcional

# Claude API (nuevo)
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Otros (ya los tienes)
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000  # O tu URL de producción
```

---

## ✅ Paso 6: Probar la Integración

1. Asegúrate de que tu app esté corriendo:
   ```bash
   bun run dev
   ```

2. Ve a Slack y crea un thread con un problema o conversación

3. En el thread, menciona al bot:
   ```
   @Tiger I crea el runbook
   ```

4. O con instrucciones personalizadas:
   ```
   @Tiger I crea el runbook enfocado en comandos de debugging
   ```

5. El bot debería responder:
   - "🤖 Generando runbook desde este thread..."
   - Luego: "✅ Runbook creado exitosamente!" con el link

---

## 🎨 Paso 7: Personalizar el Bot (Opcional)

1. Ve a **"App Home"** en tu Slack App
2. **Display Information**:
   - App Name: `Tiger I`
   - Short Description: `Genera runbooks automáticamente desde threads`
   - App Icon: Sube un icono de tanque 🦾

3. **Bot User**:
   - Display Name: `Tiger I`
   - Default Username: `@tiger-i`

---

## 🐛 Troubleshooting

### El webhook no se verifica
- Revisa que `SLACK_SIGNING_SECRET` esté en el `.env`
- Reinicia tu servidor después de agregar la variable
- Asegúrate de que la URL sea accesible públicamente

### El bot no responde
- Verifica que el bot esté en el canal:
  ```
  /invite @Tiger I
  ```
- Revisa logs del servidor para errores
- Confirma que `ANTHROPIC_API_KEY` es válida

### Error 401 en el webhook
- El Signing Secret es incorrecto
- Verifica que copiaste el correcto desde "Basic Information"

### El runbook no se genera
- Revisa que `ANTHROPIC_API_KEY` esté configurada
- Verifica logs para errores de la API de Claude
- Confirma que el thread tiene mensajes

---

## 📝 Uso

### Comando Básico
```
@Tiger I crea el runbook
```

### Con Instrucciones Personalizadas
```
@Tiger I crea el runbook enfocado en pasos de deploy
@Tiger I crea el runbook, incluye solo comandos y configuración
@Tiger I crear runbook: documenta el bug y la solución
```

El bot:
1. ✅ Lee todo el thread
2. ✅ Analiza la conversación con Claude
3. ✅ Genera un runbook estructurado en Markdown
4. ✅ Lo guarda en la base de datos
5. ✅ Responde con el link para verlo

---

## 🔄 Próximos Pasos

Una vez funcionando, podrás:
- Ver todos los runbooks en: `/tiger/runbooks` (UI próximamente)
- Editar runbooks manualmente
- Exportar a Notion cuando tengas las credenciales
- Buscar runbooks por keywords

---

## 💡 Tips

- **Mejores resultados**: Threads con contexto claro, pasos detallados, y comandos específicos
- **Naming**: Incluye keywords en las instrucciones para mejores títulos
- **Privacidad**: El bot solo puede leer canales donde está invitado
- **Límites**: Claude tiene un límite de tokens, evita threads extremadamente largos

---

¿Problemas? Revisa los logs del servidor o el dashboard de Slack App para debugging.
