# Vibe Template

Next.js (Pages Router) + Bun + PostgreSQL (en Docker) + Drizzle.

Creado por [Daniel Leal](https://github.com/daleal).

## Requisitos previos

0. Instala Bun: https://bun.sh/docs/installation

    ```sh
    curl -fsSL https://bun.com/install | bash

    echo -e '\nexport BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.zshrc

    source ~/.zshrc
    ```

1. Instala Docker (incluye Docker Compose): https://docs.docker.com/get-docker/

## Ejecutar en local (paso a paso)

0. Clona este repositorio y entra a la carpeta

1. Inicia Postgres (en Docker):

```bash
docker compose up #este levanta la base de datos ejecutar al partir.
```

2. Ejecuta el script de setup:

```bash
./scripts/setup.sh
```

3. Inicia el servidor de desarrollo:

```bash
bun run dev
```

4. Abre la app:

http://localhost:3001. Para detenerlo: Ctrl+C.

## Opcional

- UI de base de datos (Drizzle Studio):

Drizzle Studio es una interfaz web local para ver tablas y datos que hay en tu aplicación. Requiere que Postgres esté corriendo (paso 1).

```bash
bun run db:studio
```

Al ejecutarlo, verás una URL en la terminal. Ábrela en tu navegador (normalmente https://local.drizzle.studio). Para detenerlo: Ctrl+C.

## Configuración

En un archivo `.env`, puedes agregar configuración extra.

- `DATABASE_URL` es opcional. Valor por defecto:

`postgresql://postgres:postgres@localhost:5432/postgres`

(Coincide con `compose.yaml`.)

## Slack Events (webhook)

El endpoint de eventos de Slack ya existe en `pages/api/slack/events.ts`.

1. Configura en tu `.env`:

```bash
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=...
```

2. Expone tu app local:

```bash
ngrok http 3001
```

3. En Slack -> Event Subscriptions -> Request URL usa:

`https://<tu-subdominio-ngrok>/api/slack/events`

Cuando Slack valide esta URL, el endpoint respondera automaticamente el `challenge`.

## Cards application MVP

- Formulario publico: `http://localhost:3001/cards/apply`
- API de ingreso: `POST /api/cards/apply`
- Integracion Regcheck configurable via `.env`:
  - `REGCHECK_BASE_URL`
  - `REGCHECK_API_KEY`
  - `REGCHECK_CHECK_PATH`
  - Por defecto usa formato externo de Regcheq: `/record/{API_KEY}`
  - Fallback opcional via bot web (si no llega fecha en API):
    - `REGCHECK_WEB_LOGIN_URL`
    - `REGCHECK_WEB_USER`
    - `REGCHECK_WEB_PASSWORD`
    - `REGCHECK_WEB_HEADLESS`
- Notificaciones Slack:
  - `SLACK_BOT_TOKEN`
  - `SLACK_ALERTS_CHANNEL` (ID del canal, ejemplo `C06MVR75Z6D`)
  - `SLACK_RAI_USER_ID` (opcional, para aceptar reacciones de revision de riesgo)
  - `SLACK_ANTONIA_USER_ID` (opcional, para aceptar reacciones de revision manual)
  - `SLACK_ADDITIONAL_APPROVER_USER_IDS` (opcional, IDs separados por coma que tambien pueden aprobar/rechazar por reaccion)
  - Para aprobacion manual por emoji, agrega tambien el bot event `reaction_added`

## TODO proximos pasos

- Enviar email al correo del formulario cuando un caso termine en `rejected` con feedback de no cumplimiento de terminos/politicas.
- Para `approved`, ejecutar primero los checks/procesos post-aprobacion antes de enviar feedback final al cliente.

## Seguridad (entorno de pruebas)

- Slack webhook (`/api/slack/events`):
  - valida firma `x-slack-signature` y timestamp en todas las requests (incluyendo `url_verification`).
- API publica (`/api/cards/apply`):
  - rate limit basico por IP para reducir abuso en entorno de pruebas.
- Tunneling:
  - usar tuneles efimeros (ngrok URL rotativa) y renovar la Request URL de Slack cuando cambie.
