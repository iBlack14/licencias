# Extensión MTC → Licencias

La extensión no resuelve ni evade el captcha. El operador realiza la consulta manualmente en el portal oficial y la extensión envía el resultado visible al sistema.

## Instalación

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Selecciona **Cargar descomprimida** y elige esta carpeta `extension`.
4. Abre la extensión, configura la URL pública del sistema y `EXTENSION_API_TOKEN`.
5. Pulsa **Abrir MTC**, completa la consulta y el captcha.
6. Cuando aparezca el resultado, pulsa **Guardar resultado**.

El servidor guardará o actualizará el conductor en PostgreSQL con la fuente `MTC_EXTENSION`.

## Consulta iniciada desde el portal propio

Con la extensión activa, una búsqueda desde `soat-licencia.stkkft.easypanel.host` abre el MTC y completa el DNI. El usuario resuelve manualmente el captcha y pulsa Buscar. Cuando aparece el resultado, la extensión ofrece **Guardar y volver al portal**.
