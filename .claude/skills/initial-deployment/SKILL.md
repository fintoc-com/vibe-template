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

El equipo de infraestructura se encarga del despliegue. Tu parte es pedirlo en Slack con la
información correcta para que puedan ayudarte rápido.

## Cómo pedirlo

Escribe en el canal de Slack **#dev-infra** que necesitas desplegar tu app y comparte el
repositorio. Cuéntales qué necesita para funcionar, por ejemplo:

- Una base de datos.
- Un bucket para guardar archivos.
- Si es interna (se accede por Twingate) o externa (con un dominio de fintoc.com o fintoc.dev).
- Permisos para BigQuery.
- Permisos para otros servicios de GCP.
- Secretos como claves o tokens, que también te ayudan a configurar.

## Si no sabes qué necesita la app

Revisa el código junto al usuario y ármale la lista: qué servicios usa (base de datos,
BigQuery, otros), si guarda archivos, qué variables de entorno o secretos espera, y si debería
ser interna o pública. Entrega esa lista lista para copiar y pegar en #dev-infra.

## Qué pasa después

El equipo configura el repo en CircleCI y los recursos en GCP. Desde ahí, cada merge a `main`
despliega solo (`test → build → migrate → deploy`). Mientras el repo no esté configurado, el
pipeline no se gatilla, así que es seguro durante el desarrollo.
