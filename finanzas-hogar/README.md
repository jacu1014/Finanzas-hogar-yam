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
2. Ejecuta `supabase/migrations/202609260001_initial_schema.sql` desde el SQL Editor.
3. Copia `.env.example` como `.env.local` y agrega la URL del proyecto y su clave publicable.
4. No publiques claves `service_role` ni secretos en variables `NEXT_PUBLIC_*`.

La migración crea hogares, miembros, movimientos, deudas, compras históricas y listas de mercado compartidas, con políticas RLS para separar los datos por hogar. La siguiente etapa conectará la autenticación y la interfaz a estas tablas.

### GitHub y Vercel

1. Publica el repositorio en GitHub.
2. En Vercel, importa ese repositorio y selecciona esta carpeta como raíz del proyecto.
3. Agrega las variables de Supabase en las Environment Variables de Vercel.
4. Los pushes a la rama de producción generan despliegues y las ramas de trabajo generan previews.

La conexión a cuentas externas se autoriza desde GitHub y Vercel; no guardes tokens personales en el repositorio.
