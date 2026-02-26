# Playbook: Activacion de tarjetas (manual -> automatizable)

Usa esta plantilla para documentar el flujo actual. No incluyas secretos en texto plano.

## Contexto

- Objetivo del flujo:
- Equipo responsable:
- Sistemas involucrados: Kushki / Regcheck / Slack / otros
- Volumen esperado (casos por dia):
- SLA esperado (ej: activar en menos de 5 min):

## Entradas del proceso

- Datos que llegan del cliente:
- Validaciones obligatorias:
- Fuentes de verdad (donde consultar estado):

## Paso a paso actual (manual)

Completa una fila por paso real que hoy hace una persona.

| # | Sistema | Accion manual actual | Input requerido | Regla de negocio | Resultado esperado | Error frecuente |
|---|---------|----------------------|-----------------|------------------|--------------------|-----------------|
| 1 |         |                      |                 |                  |                    |                 |
| 2 |         |                      |                 |                  |                    |                 |
| 3 |         |                      |                 |                  |                    |                 |

## Decisiones y excepciones

- Que casos van por camino feliz:
- Que casos requieren revision humana:
- Motivos de rechazo/bloqueo:
- Que pasa si Kushki/Regcheck no responde:

## Evidencia y auditoria

- Donde queda registro de cada intento:
- Que datos se deben guardar por cumplimiento:
- Quien puede ver/aprobar/reintentar:

## Notificaciones

- Cuando avisar por Slack:
- Canal destino:
- Formato minimo del mensaje (id usuario, motivo, estado):

## Criterios de automatizacion (lo llena el equipo tecnico)

Marca cada paso cuando revisemos juntos:

- [ ] 100% automatizable ahora
- [ ] Automatizable con validacion adicional
- [ ] Debe quedar manual por cumplimiento

## APIs y dependencias

- Endpoint(s) de Kushki a usar:
- Endpoint(s) de Regcheck a usar:
- Evento(s) webhook disponibles:
- Rate limits conocidos:

## Definicion de exito

- KPI 1:
- KPI 2:
- KPI 3:

## Checklist de seguridad

- [ ] Secretos guardados en `.env` o secret manager (nunca en codigo)
- [ ] Endpoint(s) protegidos con `protectedHandler`
- [ ] Logs sin datos sensibles
- [ ] Idempotencia en webhooks/reintentos
