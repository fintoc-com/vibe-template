---
name: initial-deployment
description: >-
  Use this skill when the user wants to deploy their app, put it live, ship it,
  make it available on the internet, get a public URL or a domain, or asks things
  like "cómo despliego", "cómo lo subo a internet", "cómo lo dejo público", "cómo
  lo dejo disponible", "qué necesito para desplegar", or "what do I need to deploy".
  It explains what they must request from the infra team in the #dev-infra Slack
  channel to get the app deployed to Cloud Run.
---

# Desplegar tu app

El equipo de infraestructura se encarga del despliegue. El usuario tiene que pedirlo en Slack con la información correcta para que el equipo pueda ayudarlo rápido.

## Descubre qué necesita la app

Revisa el código y arma la lista de lo que necesita la app para funcionar, por ejemplo:

- Una base de datos.
- Un bucket para guardar archivos.
- Si es interna (se accede por Twingate) o externa (con un dominio de fintoc.com o fintoc.dev).
- Permisos para BigQuery.
- Permisos para otros servicios de GCP.
- Secretos como claves o tokens, que el equipo también ayuda a configurar.

Dedúcelo del código; no le pidas estos detalles técnicos al usuario.

## Antes de pedirlo

Dos cosas bloquean el despliegue:

- **El repo tiene que vivir en la organización `fintoc-com`.** Desde un repo personal, CircleCI no lo encuentra y el pipeline nunca se configura.
- **Si la app usa base de datos, el nombre del servicio no puede pasar de 15 caracteres.** GCP rechaza nombres de SA de más de 30. El repo puede conservar su nombre.

## Cómo pedirlo

Pídele al usuario que escriba en el canal de Slack **#dev-infra** para desplegar su app, comparta el repositorio y mencione esa lista. Entrégasela lista para copiar y pegar.

## Qué pasa después

El equipo configura el repo en CircleCI y los recursos en GCP. Desde ahí, cada merge a `main` despliega solo (`test → build → migrate → deploy`). Mientras el repo no esté configurado, el pipeline no se gatilla, así que es seguro durante el desarrollo.
