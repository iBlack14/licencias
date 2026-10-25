# Despliegue

## Desarrollo con Docker Compose

1. Copia `.env.example` como `.env` y cambia todas las claves marcadas con `change_me`.
2. Ejecuta `docker compose up --build -d`.
3. Comprueba el estado con `docker compose ps` y `docker compose logs -f app`.

La aplicación queda disponible en `http://localhost:3000`. Las migraciones de Prisma y la importación inicial se ejecutan automáticamente al iniciar el contenedor.

## Operaciones habituales

```bash
docker compose down
docker compose up -d
docker compose exec app npx prisma migrate deploy
docker compose exec db pg_dump -U licencias licencias > backup.sql
```

Los datos viven en el volumen `postgres_data`; `docker compose down` no los elimina. Evita `docker compose down -v` en producción.

## Producción recomendada

Para esta aplicación conviene un VPS con Docker Compose porque la consulta externa usa Chromium. Configura un dominio, un proxy HTTPS (Caddy, Traefik o Nginx), copias de seguridad de PostgreSQL y valores únicos para todos los secretos. En una plataforma administrada, usa el `Dockerfile` para la aplicación y un PostgreSQL administrado.

