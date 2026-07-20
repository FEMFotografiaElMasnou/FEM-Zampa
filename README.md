# FEM Premis Zampa

Aplicació web de la FEM per gestionar i votar els **Premis Zampa**: exposició i valoració dels portfolis fotogràfics presentats a concurs pels socis.

Documentació funcional i tècnica completa a [`DOCUMENTACIO.md`](./DOCUMENTACIO.md).

## Posada en marxa local

**Requisits:** Node.js.

1. Instal·la les dependències:
   ```
   npm install
   ```
2. (Opcional) Configura `.env.local` a partir de [`.env.example`](./.env.example) si vols fer servir un projecte Supabase o Cloudinary propis en lloc dels entorns per defecte de l'app.
3. Executa el servidor de desenvolupament:
   ```
   npm run dev
   ```
4. Per crear la base de dades a Supabase, executa el contingut de [`schema.sql`](./schema.sql) a l'SQL Editor del teu projecte.

## Scripts disponibles

- `npm run dev` — servidor de desenvolupament (port 3000).
- `npm run build` — build de producció a `dist/`.
- `npm run preview` — previsualitza el build de producció.
- `npm run lint` — comprovació de tipus amb TypeScript.
