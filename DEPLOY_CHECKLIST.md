# 🚀 Deploy Checklist - Tiger I Operations Dashboard

## 📋 Pre-Deploy: Protección del Repositorio

### 1. Configurar Protecciones de Branch en GitHub

**⚠️ CRÍTICO: Estas configuraciones se hacen en GitHub UI, NO en código**

#### Paso a Paso:

1. Ve a tu repositorio en GitHub
2. Click en **Settings** → **Branches**
3. Click en **Add branch protection rule**
4. Configura lo siguiente:

```
Branch name pattern: main

☑️ Require a pull request before merging
   ☑️ Require approvals: 1
   ☑️ Dismiss stale pull request approvals when new commits are pushed
   ☑️ Require review from Code Owners

☑️ Require status checks to pass before merging
   ☑️ Require branches to be up to date before merging

☑️ Do not allow bypassing the above settings
```

5. Click **Create** o **Save changes**

### 2. Verificar CODEOWNERS

✅ Ya creado en `.github/CODEOWNERS`
- Define quién debe revisar qué partes del código
- Requests automáticos de review cuando se toca código crítico

### 3. PR Template

✅ Ya creado en `.github/pull_request_template.md`
- Asegura que todos los PRs tengan información necesaria
- Checklist de validación antes de merge

---

## 🔐 Checklist de Seguridad

- [ ] Variables de entorno configuradas en Vercel:
  - [ ] `DATABASE_URL` (Supabase production)
  - [ ] `ANTHROPIC_API_KEY`
  - [ ] `SLACK_SIGNING_SECRET`
  - [ ] `SLACK_BOT_TOKEN`
  - [ ] `SLACK_CHANNEL_ID`
  - [ ] `BETTER_AUTH_SECRET` (generar nuevo para prod)
  - [ ] `BETTER_AUTH_URL` (URL de producción)

- [ ] Protecciones de branch configuradas en GitHub
- [ ] Code Owners configurado
- [ ] Secrets rotados para producción (NO usar los de dev)

---

## 🗄️ Checklist de Base de Datos

- [ ] Supabase project creado
- [ ] PostgreSQL 15+ configurado
- [ ] Todas las migraciones aplicadas:
  ```bash
  bun run db:migrate
  ```
- [ ] Arquetipos importados a producción:
  ```bash
  bun run scripts/seed-archetypes-production.ts
  ```
- [ ] Backup automático configurado en Supabase
- [ ] Connection pooling habilitado (pgBouncer)

---

## 📡 Checklist de Slack Integration

- [ ] Webhook URL actualizada en Slack App:
  ```
  https://your-domain.vercel.app/api/slack/events
  ```
- [ ] Event subscriptions configuradas:
  - `app_mention`
  - `message.channels` (opcional)

- [ ] Scopes verificados:
  - `app_mentions:read`
  - `channels:history`
  - `chat:write`
  - `users:read`
  - `files:read`

- [ ] Slack App instalada en workspace de producción

---

## 🚀 Checklist de Deploy

### Vercel Configuration

- [ ] Proyecto creado en Vercel
- [ ] GitHub repository conectado
- [ ] Branch de producción: `main`
- [ ] Auto-deploy configurado
- [ ] Environment variables configuradas (ver arriba)

### Build Settings

```bash
Build Command: bun run build
Output Directory: .next
Install Command: bun install
Node Version: 20.x
```

### Deployment

- [ ] Hacer commit de cambios:
  ```bash
  git add .
  git commit -m "feat: ready for production deployment"
  ```

- [ ] Push a branch de feature:
  ```bash
  git push origin feat/tiger-slack-integration
  ```

- [ ] Crear Pull Request en GitHub

- [ ] Esperar review y aprobación (requerido por branch protection)

- [ ] Merge a `main` (trigger automático de deploy)

- [ ] Verificar deployment en Vercel dashboard

---

## ✅ Post-Deploy Verification

- [ ] Dashboard carga correctamente: `https://your-domain.vercel.app/tiger`
- [ ] Login funciona con BetterAuth
- [ ] Mensajes se muestran desde Supabase
- [ ] Arquetipos se cargan correctamente
- [ ] Gráficos renderizan sin errores
- [ ] Webhook de Slack responde (probar con @TigerI en Slack)
- [ ] Generación de runbooks funciona
- [ ] Sync manual de mensajes funciona

---

## 🔄 Workflow de Desarrollo (Post-Deploy)

### Para cada nueva feature:

1. **Crear branch desde `main`**:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/nombre-descriptivo
   ```

2. **Desarrollar y commitear**:
   ```bash
   git add .
   git commit -m "feat: descripción del cambio"
   git push origin feat/nombre-descriptivo
   ```

3. **Crear Pull Request en GitHub**

4. **Esperar review** (OBLIGATORIO - configurado en branch protection)

5. **Aprobar y Merge** (solo después de review aprobado)

6. **Vercel auto-deploys** a producción

---

## 🆘 Rollback de Emergencia

Si algo falla en producción:

1. Ve a **Vercel Dashboard** → tu proyecto
2. Click en **Deployments**
3. Encuentra el último deployment estable
4. Click en **⋯** → **Promote to Production**
5. Confirma el rollback

O desde CLI:
```bash
vercel rollback
```

---

## 📊 Monitoreo

- [ ] Configurar alertas en Vercel (errors, timeouts)
- [ ] Revisar logs regularmente: `vercel logs`
- [ ] Monitorear uso de Anthropic API
- [ ] Revisar database performance en Supabase

---

## 🎯 Estado Actual

### ✅ Completado
- [x] 15 arquetipos de Claude importados
- [x] 1,317 mensajes clasificados
- [x] Webhook de Slack funcionando
- [x] Dashboard con gráficos (área, barras, 100%)
- [x] Bulk actions para mover mensajes
- [x] Markdown formatting mejorado
- [x] Filtros por días sincronizados
- [x] Protecciones de repositorio (CODEOWNERS, PR template)

### ⏳ Pendiente
- [ ] Configurar branch protections en GitHub UI
- [ ] Crear proyecto en Vercel
- [ ] Configurar Supabase para producción
- [ ] Actualizar webhook URL en Slack
- [ ] Primer deployment a producción
- [ ] Verificación post-deploy

---

## 📞 Contactos de Emergencia

- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support
- **Anthropic Support**: support@anthropic.com

---

**Última actualización**: $(date)
