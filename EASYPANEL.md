# Despliegue con Docker Compose en EasyPanel

Este proyecto se despliega como un único servicio **Compose**. EasyPanel construye la aplicación y levanta PostgreSQL con un volumen persistente.

## Configuración

1. Crea un proyecto y selecciona **New Service → Compose**.
2. Elige **Git** y conecta el repositorio.
3. Usa Build Path `/` y Docker Compose File `docker-compose.yml`.
4. En **Environment**, agrega:

```env
POSTGRES_DB=licencias
POSTGRES_USER=licencias
POSTGRES_PASSWORD=UNA_CLAVE_LARGA_Y_UNICA
ADMIN_USER=admin
ADMIN_PASSWORD=OTRA_CLAVE_LARGA_Y_UNICA
CAPTCHA_SECRET=UN_VALOR_ALEATORIO_LARGO
EXTENSION_API_TOKEN=OTRO_VALOR_ALEATORIO_LARGO
```

No definas `DATABASE_URL`: Compose la construye usando el servicio interno `db`.

## Dominio

Después del despliegue, agrega un dominio con Internal service `app`, Target port `3005` y protocolo `HTTP`. No publiques puertos manualmente; EasyPanel administra HTTPS y PostgreSQL permanece privado.

## Persistencia

PostgreSQL usa el volumen `postgres_data`. No destruyas el servicio Compose ni cambies el volumen sin un backup. La App ejecuta `npx prisma migrate deploy` antes de iniciar. Configura también backups externos de PostgreSQL.
