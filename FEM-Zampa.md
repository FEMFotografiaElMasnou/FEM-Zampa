# FEM Premis Zampa — Documentació

Documentació funcional i tècnica de l'app de gestió i votació dels Premis Zampa de la FEM.

---

## 1. Context i flux de negoci

Cada any la FEM organitza els **Premis Zampa**, un concurs de portfolis i projectes fotogràfics de llarg recorregut presentats per autors individuals.

1. **Creació i muntatge**: l'equip editorial (administradors i editors) dona d'alta els projectes participants d'una edició i hi puja els mosaics de fotos de cada portfoli.
2. **Exposició i votació dels socis** (aquesta app): un cop l'edició s'obre a votació, els socis registrats ordenen de 1 a N tots els projectes de la categoria Adult, segons la seva preferència.
3. **Tancament i veredicte**: l'equip editorial tanca l'accés a noves votacions, introdueix el guanyador oficial designat pel tribunal i la classificació del vot popular de la sala.
4. **Resultats i afinitat**: un cop publicats els resultats, cada soci pot consultar com de a prop va quedar el seu propi rànquing respecte al guanyador oficial i respecte al vot popular. Les edicions anteriors queden accessibles per consulta des d'un selector d'edició.

---

## 2. Arquitectura tècnica

- **React 19** + **TypeScript** + **Vite 6**, amb **Tailwind CSS 4**.
- **Supabase** (`@supabase/supabase-js`) com a capa de dades i autenticació.
- **Cloudinary** per a l'allotjament i processament d'imatges.
- **piexifjs** per llegir/reescriure metadades EXIF i eliminar dades GPS abans de pujar les fotos.
- **lucide-react** per a la iconografia.

Components principals:

- `App.tsx` — orquestrador general: autenticació, càrrega de dades, topbar, selector d'idioma i d'entorn de base de dades, encaminament entre les pantalles de soci i d'administració.
- `ZampaAdmin.tsx` — panell d'administració: gestió d'edicions, projectes, fotos i veredicte final.
- `ZampaParticipant.tsx` — pantalles de soci: votació, consulta d'edicions passades i resultats d'afinitat.
- `ZampaSubComponents.tsx` — vistes de suport reutilitzades (classificació de consens, comparatives, taules de resultats).
- `ConfirmModal.tsx` i `FullscreenViewer.tsx` — components compartits (diàlegs de confirmació i visor d'imatges a pantalla completa).
- `lib/supabaseClient.ts` — client de Supabase, commutació d'entorns i eina de rèplica de dades.
- `lib/cloudinary.ts` — compressió d'imatges i pujada a Cloudinary.

### Selecció d'entorn de base de dades

Un commutador a la topbar permet triar entre tres entorns de Supabase, persistits a `localStorage` (`femvotacions_dbmode`):

- **Normal**: base de dades de producció.
- **Test**: base de dades secundària per a proves i assajos (entorn per defecte si no se n'especifica cap altre).
- **Pròpia**: permet enganxar la URL i la clau anon d'un projecte Supabase propi directament des de la interfície.

Si es defineixen les variables d'entorn `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`, aquestes tenen prioritat sobre els tres selectors anteriors. En canviar d'entorn es reconstrueix el client de Supabase i es tanca la sessió activa.

### Interfície bilingüe

La interfície es pot commutar entre català i castellà (`lib/translations.ts`).

---

## 3. Comptes i permisos

Cada usuari (`users`) té dos camps de rol independents:

- **`role`**: `'admin'` o `'participant'` — rol general de la FEM a l'aplicació.
- **`zampa_role`**: `'admin'`, `'editor'` o `'user'` — permisos específics dins del mòdul Zampa.

Un usuari accedeix al mode d'administració Zampa si `role === 'admin'` o `zampa_role` és `'admin'` o `'editor'`. Dins del mode d'administració hi ha dues pestanyes:

- **Zampa**: gestió d'edicions, projectes, fotos i veredictes (accessible a `admin`/`editor`).
- **Gestió de Socis** (*Cens de socis i membres*): llistat de tots els usuaris amb opcions per canviar el nom, assignar rol Zampa, restablir la contrasenya (obligant l'usuari a crear-ne una de nova al pròxim accés, sense perdre les seves dades) o eliminar el compte i totes les seves dades associades. Reservada als usuaris amb `role === 'admin'` o `zampa_role === 'admin'`.

El registre de nous comptes es fa des de la pantalla d'accés; el compte es crea sempre amb `role: 'participant'` i `zampa_role: 'user'`.

---

## 4. Esquema de base de dades (Supabase)

Script complet a [`schema.sql`](./schema.sql).

### `users` — socis, administradors i editors

```sql
create table users (
  id text primary key,
  display_name text not null,
  email text unique not null,
  password text not null,
  role text default 'participant' not null,       -- 'admin' | 'participant'
  zampa_role text default 'user' not null,         -- 'admin' | 'editor' | 'user'
  created_at timestamptz default now(),
  submitted_at timestamptz
);
```

### `zampa_editions` — edicions anuals

```sql
create table zampa_editions (
  id integer primary key,          -- p. ex. 2026
  status text default 'open' not null,  -- 'open' | 'vote' | 'closed' | 'finished'
  official_winner_adult text references zampa_projects(id)
);
```

### `zampa_projects` — portfolis participants

```sql
create table zampa_projects (
  id text primary key,
  edition_year integer references zampa_editions(id) on delete cascade not null,
  category text default 'adult' not null,
  author_name text not null,
  project_title text not null,
  description text,
  popular_rank_position integer,
  submitted_at timestamptz default now() not null
);
```

### `zampa_photos` — fotos dels projectes

```sql
create table zampa_photos (
  id text primary key,
  project_id text references zampa_projects(id) on delete cascade not null,
  file_url text not null,
  file_name text,
  photo_title text,
  description text,
  order_index integer not null
);
```

### `zampa_user_ranks` — votacions dels socis

```sql
create table zampa_user_ranks (
  id serial primary key,
  user_id text references users(id) on delete cascade not null,
  project_id text references zampa_projects(id) on delete cascade not null,
  edition_year integer not null,
  category text default 'adult' not null,
  assigned_position integer not null,
  submitted_at timestamptz default now() not null,
  unique (user_id, project_id)
);
```

`schema.sql` activa Row Level Security amb polítiques obertes per a la clau anon, adequades al model d'autenticació propi de l'app (usuari/contrasenya gestionats a la taula `users`, no Supabase Auth).

---

## 5. Gestió d'imatges (Cloudinary)

- Compressió client via `<canvas>`: redimensió a màxim **4800×4800px**, exportació JPEG a **qualitat 0.88**.
- Lectura d'EXIF amb `piexifjs`, **eliminació del bloc GPS** (privadesa) i reinjecció de la resta de metadades (model de càmera, obertura, ISO, etc.) al fitxer final abans de pujar-lo a Cloudinary.
- Configurable via `VITE_CLOUDINARY_CLOUD` i `VITE_CLOUDINARY_PRESET`; si no es defineixen, s'utilitzen els valors per defecte del projecte de la FEM.

---

## 6. Flux de negoci: estats de l'edició

Controlats pel camp `zampa_editions.status`:

1. **`open`** — L'equip editorial crea/edita projectes i puja fotos; els socis veuen un missatge d'espera indicant que l'edició està en fase de preparació.
2. **`vote`** — Es bloqueja l'edició de projectes/fotos; els socis poden visionar els portfolis i enviar el seu rànquing (categoria Adult). Un cop enviat, el rànquing d'aquell soci queda bloquejat.
3. **`closed`** — Els socis veuen el seu propi rànquing en mode consulta. L'administració introdueix el veredicte: guanyador oficial i la classificació del vot popular de la sala.
4. **`finished`** — Es desbloquegen per a tots els socis les pantalles de resultats i afinitat.

Els socis poden consultar edicions anteriors des d'un selector desplegable a la seva pantalla principal, que mostra el contingut adaptat a l'estat en què va quedar cada edició.

---

## 7. Pantalles d'Administració (`ZampaAdmin.tsx`)

- Creació d'una nova edició anual i control del seu estat (`open` → `vote` → `closed` → `finished`, amb possibilitat de tornar enrere per corregir errors).
- Formulari d'alta de projecte (autor, títol, descripció) i llistat general de projectes de l'edició activa.
- Editor de portfoli individual amb **càrrega múltiple** (arrossegar i deixar anar, o selecció d'arxius), amb compressió client automàtica seqüencial abans de pujar.
- **Edició inline** de títol i descripció de cada foto, desat automàtic en perdre el focus amb confirmació visual.
- Reordenació de fotos amb botons de moure endavant/enrere que actualitzen `order_index`.
- Panell d'introducció del veredicte a l'estat `closed`: selecció del guanyador oficial i assignació de la classificació del vot popular (per projecte o per posició).
- Un cop l'edició està tancada o finalitzada, l'administració pot consultar el rànquing de consens (posició mitjana calculada a partir de tots els vots dels socis).
- **Eina de rèplica de dades** (Sandbox → Producció): analitza les diferències entre l'entorn de Test i el de Producció (edicions, projectes, fotos, vots i socis que falten) i permet replicar el contingut assajat a l'entorn Test cap al de Producció en un sol pas, amb opció de copiar també els socis que encara no existeixin allà.
- **Generador de dades de prova**: eines per generar (i eliminar) vots ficticis i un veredicte ficticiu sobre l'edició activa, útils per provar les pantalles de resultats sense esperar votacions reals.

---

## 8. Pantalles de Soci (`ZampaParticipant.tsx`)

- Selector d'edició (any) per consultar l'edició activa o qualsevol edició anterior.
- Llista ordenable dels projectes de la categoria Adult, amb reordenació mitjançant fletxes que recalculen les posicions a l'instant.
- Visor a pantalla completa amb zoom, desplaçament tàctil i descàrrega de les fotos de cada portfoli.
- Botó d'enviament del rànquing amb confirmació, que bloqueja la votació d'aquell soci un cop enviada.
- Un cop l'edició està `finished`, pantalles de resultats i afinitat amb el guanyador oficial i el vot popular.

---

## 9. Components compartits.

- **`ConfirmModal`**: diàlegs de confirmació personalitzats (sense `window.confirm` natiu) per a accions crítiques: eliminar projectes, esborrar fotografies, enviar el rànquing definitiu o tancar/finalitzar una edició.
- **`FullscreenViewer`**: visualitzador d'imatges a pantalla completa amb zoom, desplaçament tàctil i descàrrega, utilitzat tant a l'administració com a les pantalles de soci.

---

## 10. Còpia de seguretat i restauració (`backup_zampa_2026/`)

Aquesta carpeta conté un paquet autònom de còpia de seguretat i restauració de l'edició 2026: bolcats en JSON/CSV de totes les taules Zampa (edicions, projectes, fotos, rànquings i socis implicats) i dos scripts TypeScript (`generate_zampa_2026_data_dumps.ts` per generar el bolcat des de producció, `restore_zampa_2026.ts` per restaurar-lo en una base de dades buida). Vegeu `README_RECONSTRUCCIO_ZAMPA_2026.md` dins la mateixa carpeta per als detalls d'ús.

---

## 11. Desplegament

L'app es desplega com a Vercel Static/SPA (build amb `vite build`, sortida a `dist/`). El repositori inclou també configuració de Firebase Hosting (`firebase.json`, `.firebaserc`) com a via de desplegament alternativa.
