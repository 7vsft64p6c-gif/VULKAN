# VULKÁN 2.0

VULKÁN es un e-commerce de productos tecnológicos de fabricación alternativa. Esta versión conserva la base existente en HTML, CSS, JavaScript y PHP, y refuerza el catálogo, carrito, pedidos, cuentas, cupones, seguridad y experiencia visual.

> Los pagos en línea están desactivados. El sitio permite preparar y registrar pedidos, pero no cobra ni simula cobros. La arquitectura de proveedores se conserva únicamente para una activación futura y controlada.

## Estado funcional

- Home y catálogo responsivos con la identidad visual volcánica de VULKÁN.
- Catálogo alimentado por `public/products.json`.
- Carrito local que conserva identificadores, cantidades y variantes; los precios mostrados por el navegador no son autoridad.
- Precio normal para 1–2 unidades y precio mayorista desde 3 unidades del mismo producto, recalculado por el backend.
- Cupón inicial `VULKAN10`: 10 % de descuento, configurado y validado en la base de datos.
- Registro, inicio y cierre de sesión, perfil, cambio y recuperación de contraseña.
- Pedidos consultables por el titular autenticado o mediante un token opaco del pedido.
- Rol `CUSTOMER` operativo y rol `ADMIN` preparado del lado del servidor; no se incluye un panel administrativo.
- Pagos en línea bloqueados por configuración y por validación del backend.

La información comercial se mantiene deliberadamente prudente: el proyecto no afirma originalidad, certificaciones, garantías, compatibilidades, contenido de caja o stock cuando los datos entregados no lo sustentan.

## Requisitos

- PHP 8.1 o posterior.
- Extensiones PHP: PDO y el controlador de la base elegida (`pdo_sqlite` o `pdo_mysql`); `mbstring` para validación de texto. `curl` solo será necesario si en el futuro se activa un proveedor HTTP de pagos.
- SQLite 3 para desarrollo local o MySQL/MariaDB con InnoDB para producción.
- Apache con `mod_rewrite`, `mod_headers`, `mod_deflate` y `mod_expires` recomendados para producción. El servidor integrado de PHP sirve para desarrollo, no para publicar el sitio.

No se incorporó un gestor de paquetes ni una compilación de frontend. Las páginas y recursos se sirven directamente desde `public/`.

## Inicio local seguro

1. Copia `.env.example` a `.env` en la raíz del proyecto, nunca dentro de `public/`.
2. Mantén estas barreras mientras no se haya aprobado la activación de cobros:

   ```dotenv
   APP_ENV=development
   PAYMENTS_ENABLED=false
   PAYMENT_PROVIDER=disabled
   DB_DRIVER=sqlite
   DB_SQLITE_PATH=/ruta/absoluta/segura/vulkan.sqlite
   STORAGE_PATH=/ruta/absoluta/segura/vulkan-storage
   ```

3. Crea una base SQLite con `sql/schema.sqlite.sql`, o deja que la primera conexión cree el archivo y aplique ese esquema.
4. Comprueba que la carpeta indicada por `STORAGE_PATH` sea escribible por PHP y no sea pública.
5. Sirve el proyecto desde la raíz:

   ```bash
   php -S 127.0.0.1:8000 -t public
   ```

6. Abre `http://127.0.0.1:8000/`.

No abras los HTML con `file://`: el catálogo y las APIs necesitan un origen HTTP.

## Rutas principales

| Ruta | Propósito |
| --- | --- |
| `/` o `/index.html` | Inicio, propuesta de valor y acceso al catálogo. |
| `/catalogo.html` | Búsqueda, filtros, variantes y carrito. |
| `/checkout.html` | Validación del carrito y confirmación del pedido; no inicia pagos. |
| `/order.html` | Consulta protegida de un pedido. |
| `/cuenta.html` | Registro, sesión, perfil, contraseña y pedidos del usuario. |
| `/api/…` | API PHP; los endpoints y contratos se describen en `docs/ARCHITECTURE.md`. |

Las páginas `payment-success.html`, `payment-pending.html` y `payment-failure.html` se conservan para compatibilidad futura, no como un flujo de cobro activo.

## Fuentes de verdad

| Dato | Fuente autorizada |
| --- | --- |
| Nombre, categoría, imágenes, variantes y precios base/mayorista | `public/products.json`, leído también por el backend. |
| Stock numérico | `product_stock` cuando existe un inventario cargado. La ausencia de un conteo real se presenta como disponibilidad por confirmar. |
| Usuarios, versión lógica de sesión, perfiles y pedidos | Base de datos. La sesión PHP activa usa el almacenamiento configurado por PHP. |
| Cupones, vigencia, límites y contador de uso | Base de datos. |
| Carrito antes de confirmar | `localStorage`, solo como estado de interfaz. |
| Totales finales | Backend, en céntimos enteros. |

El servidor ignora precios, subtotales, descuentos y totales enviados por el navegador.

## Configuración

`.env.example` enumera las variables admitidas. Reglas importantes:

- `.env` y la base SQLite deben permanecer fuera de `public/`.
- `APP_BASE_URL` debe ser el origen HTTPS exacto de producción.
- `FRONTEND_ORIGIN` se deja vacío cuando frontend y API comparten origen.
- Las tarifas de envío son configuración comercial: deben confirmarse antes de publicar.
- La recuperación por correo permanece desactivada hasta conectar y probar un canal transaccional real.
- No añadas tokens de pago hasta completar el checklist de `docs/PAYMENTS.md`.

## Comprobaciones antes de publicar

- Aplicar el esquema correcto a una instalación nueva. Para una base anterior, respaldar y aplicar una sola vez la migración incluida en `sql/migrations/`; los pedidos históricos requieren una estrategia de asociación o recuperación.
- Ejecutar la matriz de `docs/AUDIT.md` con PHP 8.1+ y registrar los resultados reales.
- Confirmar tarifas, contacto, inventario y textos comerciales con el responsable de la tienda.
- Probar registro, login, CSRF, recuperación, propiedad de pedidos y cupón en una sesión limpia.
- Verificar que `.env`, `storage/`, logs, SQLite, SQL y librerías PHP no respondan por HTTP.
- Mantener `PAYMENTS_ENABLED=false` hasta una activación formal.
- Medir rendimiento en móvil y escritorio sobre el servidor final; no confundir las metas de `docs/PERFORMANCE.md` con resultados medidos.

## Documentación

- `docs/AUDIT.md`: auditoría de entrada, decisiones y matrices de QA.
- `docs/ARCHITECTURE.md`: componentes, datos, API y flujos.
- `docs/DEVELOPMENT.md`: entorno, base de datos y forma segura de extender el proyecto.
- `docs/SECURITY.md`: límites de confianza, controles y pendientes de producción.
- `docs/PERFORMANCE.md`: diagnóstico de recursos, decisiones y presupuesto.
- `docs/AUTHENTICATION.md`: cuentas, sesiones, roles y recuperación.
- `docs/COUPONS.md`: reglas, cálculo y administración de cupones.
- `docs/PAYMENTS.md`: arquitectura inactiva y checklist de activación.
- `docs/CHANGELOG.md`: cambios relevantes de VULKÁN 2.0.

## Nota de validación

La documentación distingue entre revisión estática, prueba de esquema y prueba de ejecución. La entrega no debe describirse como validada de extremo a extremo hasta completar y registrar en `docs/AUDIT.md` las pruebas con un runtime PHP, navegador y servidor equivalentes al destino.
