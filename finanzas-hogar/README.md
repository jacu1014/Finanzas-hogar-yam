This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Casa Clara

Panel para organizar las finanzas de un hogar compartido: ingresos por persona, gastos, deudas, compras de mercado y análisis mensual. La interfaz actual es una vista previa; los movimientos nuevos se guardan en el navegador mientras se configura la conexión real.

### Desarrollo local

Desde esta carpeta del proyecto:

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

### Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta en orden `supabase/migrations/202609260001_initial_schema.sql`, `supabase/migrations/202609290001_family_profiles.sql`, `supabase/migrations/202609290002_authenticated_table_grants.sql`, `supabase/migrations/202609300001_household_invites_realtime.sql` y `supabase/migrations/202609300002_monthly_budget_plan.sql` desde el SQL Editor.
3. En Project Settings → API copia la URL del proyecto y la clave `publishable` (o la clave `anon` heredada).
4. Crea `.env.local` en la carpeta de la app con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Agrega esas mismas variables en Vercel para Production, Preview y Development, y vuelve a desplegar.
6. En Supabase → Authentication → URL Configuration registra la URL local y el dominio de Vercel en Site URL / Redirect URLs.

La aplicación permite crear cuenta o iniciar sesión con correo y contraseña. Si la confirmación por correo está activada, confirma el mensaje antes del primer inicio. Después puedes crear el hogar, registrar perfiles familiares y definir un presupuesto; ingresos, gastos, deudas y mercado se agregan manualmente desde la interfaz. No hay datos financieros predeterminados.

Para compartir un hogar con otra cuenta, abre `Mi familia`, copia el código de invitación y compártelo de forma privada. La otra cuenta debe iniciar sesión, abrir `Mi familia` y canjear el código; esto crea su membresía real bajo el mismo `household_id`. Si tiene varios hogares asociados, puede elegir cuál consultar en el selector superior. Los cambios en movimientos, integrantes, deudas, mercado y lista compartida se actualizan en vivo con Supabase Realtime.

Los UUID existentes identifican hogares distintos aunque sus nombres o perfiles coincidan. La invitación no borra ni fusiona automáticamente esos hogares: para los dos hogares creados por separado, elijan cuál conservar, compartan el código de ese hogar y únanse a él antes de considerar limpiar el otro.

En Mercado puedes guardar cada compra con tienda, fecha, cantidad y precio unitario por producto. El módulo compara el último precio registrado con la compra anterior de la misma unidad y contrasta el gasto total del mes con el anterior. Usa las tablas `market_purchases` y `market_purchase_items` existentes.

La sección Presupuesto guarda los pagos previstos por concepto y categoría. La suma de sus partidas actualiza `households.monthly_budget` automáticamente; allí mismo se compara lo planificado con los gastos reales registrados durante el mes y se muestran las diferencias por categoría.

Los movimientos de gastos utilizan el mismo catálogo de categorías del presupuesto para que las comparaciones coincidan. `Otros` permite registrar gastos no planificados; aparecen como gasto real fuera del plan y no aumentan el presupuesto previsto.

No publiques claves `service_role` ni secretos en variables `NEXT_PUBLIC_*`.

### GitHub y Vercel

1. Publica el repositorio en GitHub.
2. En Vercel, importa ese repositorio y selecciona esta carpeta como raíz del proyecto.
3. Agrega las variables de Supabase en las Environment Variables de Vercel.
4. Los pushes a la rama de producción generan despliegues y las ramas de trabajo generan previews.

La conexión a cuentas externas se autoriza desde GitHub y Vercel; no guardes tokens personales en el repositorio.
