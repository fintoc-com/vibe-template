# Vibe Template

Next.js (Pages Router) + Bun + PostgreSQL (en Docker) + Drizzle.

Creado por [Daniel Leal](https://github.com/daleal).

## Requisitos previos

1. Instala Bun: https://bun.sh/docs/installation

    ```sh
    curl -fsSL https://bun.com/install | bash
    ```

2. Instala Docker (incluye Docker Compose): https://docs.docker.com/get-docker/

## Ejecutar en local (paso a paso)

0. Clona este repositorio y entra a la carpeta

1. Instala dependencias:

```bash
bun install
```

2. Inicia Postgres (en Docker):

```bash
docker compose up -d
```

3. Aplica las migraciones de la base de datos:

```bash
bun run db:migrate
```

4. Inicia el servidor de desarrollo:

```bash
bun run dev
```

5. Abre la app:

http://localhost:3000. Para detenerlo: Ctrl+C.

## Opcional

- UI de base de datos (Drizzle Studio):

Drizzle Studio es una interfaz web local para ver tablas y datos que hay en tu aplicación. Requiere que Postgres esté corriendo (paso 2).

```bash
bun run db:studio
```

Al ejecutarlo, verás una URL en la terminal. Ábrela en tu navegador (normalmente https://local.drizzle.studio). Para detenerlo: Ctrl+C.

## Configuración

En un archivo `.env`, puedes agregar configuración extra.

- `DATABASE_URL` es opcional. Valor por defecto:

`postgresql://postgres:postgres@localhost:5432/postgres`

(Coincide con `compose.yaml`.)
