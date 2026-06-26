# Documentació Tècnica Unificada del Sistema: FEM Votacions (Reptes + Premis Zampa)

Aquest document consolida la definició tècnica, l'arquitectura de dades, la mecànica de tractament de mitjans digitals, els fluxos de treball de la interfície d'usuari i els algorismes de càlcul de la línia d'aplicacions de la FEM: **FEM Reptes** (concurs mensual de temàtiques) i **Premis Zampa** (exposició anual de portafolis).

Està pensat per actuar com la base del coneixement mestre que guiarà qualsevol evolució, canvi o manteniment futur sobre l'aplicació.

---

## 🛡️ SECCIÓ CRÍTICA: Garantia de Desacoblament i Independència de Mòduls

Per respondre amb total seguretat i certesa a la preocupació fonamental sobre futures evolucions: **podeu fer qualsevol canvi en el mòdul "FEM Reptes" amb la garantia de que no afectarà en cap aspecte a la funcionalitat d'escriptori i operativitat del mòdul "Premis Zampa"**.

A continuació es detallen els tres pilars arquitectònics que blindgen aquesta independència i fan que el sistema estigui completament lliure de dependències acoblades o creuades:

### 1. Aïllament Absolut a la Base de Dades (Esquema SQL)
Tot i que ambdós mòduls resideixen en la mateixa base de dades per simplificar l'administració de l'allotjament, de cara a les taules de treball hi ha una separació física infranquejable:
*   **Mòdul FEM Reptes**: Treballa exclusivament sobre les taules tradicionals `objectives`, `photo_submissions` (fotos del repte), `votes` (vots a 3 criteris), i `settings` (configuracions del concurs actiu).
*   **Mòdul Premis Zampa**: Treballa única i exclusivament sobre la lògica de taules amb el prefix corporatiu `zampa_` (`zampa_editions`, `zampa_projects`, `zampa_photos` i `zampa_user_ranks`).
*   **Vincle Segur**: L'únic punt en comú transversal és la taula d'usuaris (`users`), utilitzada exclusivament de forma consultiva per heretar les credencials del soci i estalviar-li un segon registre. De fet, per no interferir amb el codi existent de Reptes, Zampa defineix el seu propi criteri de drets administratius dins de la columna concurrent `zampa_role` (amb valors `'admin' | 'editor' | 'user'`), la qual conviu en polifonia lliure sense col·lidir amb l'històric `role` del repte.

### 2. Arquitectures de Codi TSX i Fitxers Separats
La lògica i disseny dels dos sistemes es gestiona de manera encapsulada des del directori `/src/components`:
*   La programació i renders dels panells de Reptes resideixen principalment a `App.tsx` i subcomponents d'estil preexistents.
*   Totes les eines de control, formularis, galeries, ordenació de podis n, configuracions de l'any actiu i veredictes dels Premis Zampa estan aïllades en dos arxius encapsulats: `/src/components/ZampaAdmin.tsx` i `/src/components/ZampaParticipant.tsx`.
*   El punt d'unió és un canvi de variable reactiva visual (`Reptes ⇄ Zampa` a la `topbar`), el qual munta condicionalment un mòdul o l'altre. En modificar visualment la vista de Reptes, no esteu canviant la targeta o mètode del component Zampa.

### 3. State Management i Sessió de Memòria Independents
*   **`localStorage` diferenciat**: El sistema utilitza identificadors propis que no comparteixen dades operatives. L'estat d'entorn s'emmagatzema sota `femvotacions_dbmode`, mentre que els processos d'any del Zampa viatgen de forma aïllada.
*   **Light Polling separat**: L'algorisme de sincronització ràpida en segon pla compta amb mètodes d'auditoria que llegeixen les taules per canals exclusius (la comprovació ràpida de Reptes monitoritza `settings` i `votes` per rellançar si cal `loadAllData`; els mètodes de Zampa no influeixen en aquest flux natiu de render).

---

## 1. Arquitectura de l'Aplicació i Commutació en Calent

L'aplicació està implementada com una **Single-Page Application (SPA)** de codi net, construïda sobre React 18, Vite i Tailwind CSS. Compta amb una sèrie de llibreries especialitzades carregades per optimitzar el funcionament del client:
*   **Supabase client** (`@supabase/supabase-js`): Persistència en temps real, gestió d'usuaris i escriptura de dades.
*   **JSZip** (`jszip.min.js`): Agrupació en segon pla de carpetes de fotos per a descàrregues massives administratives.
*   **piexifjs** (`piexif.min.js`): Gestió de dades fotogràfiques de client per a privadesa geogràfica d'alta fidelitat.

### Commutació Dinàmica de Base de Dades (Normal vs. Test vs. Pròpia)
Els administradors i editors disposen d’un grup de controls visuals a la barra superior (`topbar`) per triar en quin entorn treballar en temps real:
*   **Entorn Normal (Producció)**: Connecta amb els camps de l'històric real de socis i records.
*   **Entorn Test (Proves)**: Sandbox dissenyada per a que la junta assagi noves activitats, crei votants falsos de prova i provi els formularis sense alterar les puntuacions de la temporada (predeterminat del sistema).
*   **Entorn Pròpia (Custom)**: Permet que qualsevol àrea de desenvolupament configuri de forma tancada des de l'app un URL i una clau API personalitzades.

*   **Filosofia Zero-Configuració (Zero Configuration)**: Per tal de facilitar l'arrancada local dins d'AI Studio o d'escriptoris domèstics, s'ha eliminat la restricció estricta d'exigir variables de fitxer d'entorn al `.env.example`. L'aplicació compta amb una arrel d'inici intel·ligent que, de no trobar credentials des de l'entorn, executa de manera transparent i fluida l'entrada dels paràmetres de fallback de producció integrats.

---

## 2. Definició de Taules i Esquema SQL (Supabase)

L'esquema global està gestionat en 9 taules que s'autentiquen de manera segura mitjançant Row Level Security (RLS) regulada per clau pública anònima (`anon key`):

```
                                          [USERS]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             ─── TAULES REPTES ───                       ─── TAULES ZAMPA ───
         * objectives                                * zampa_editions
         * photo_submissions                         * zampa_projects
         * votes                                     * zampa_photos
         * settings                                  * zampa_user_ranks
```

### 2.1. Taula: `users`
Conté el cens unificat dels socis participants i administradors autoritzats de la FEM.
```sql
create table users (
  id text primary key, -- p. ex. 'u_1773496352' o uuid autogenerat
  display_name text not null,
  email text unique not null,
  password text not null, -- emmagatzemat per a comparativa directa de sessió d'accés
  role text default 'participant' not null check (role in ('admin', 'participant')),
  zampa_role text default 'user' not null check (zampa_role in ('admin', 'editor', 'user')),
  created_at timestamptz default now() not null,
  submitted_at timestamptz -- registre dinàmic de canvis d'estat de vots
);
```
*   **Reset de Contrasenya**: Si se sol·licita un restabliment d'accés per part de d'un gestor, el camp `password` es canvia a un string buit `''`. En connectar-se per primer cop l'usuari amb el seu codi, l'aplicació l'intercepta natius i l'obliga a donar d'alta una nova contrasenya de treball mitjançant el diàleg `#modal-new-password` de seguretat.

### 2.2. Taules del Circuit de Reptes Mensuals

#### Taula: `objectives` (Temàtiques de concurs)
```sql
create table objectives (
  id text primary key,
  title text not null,
  description text,
  status text default 'inactive' not null check (status in ('active', 'finished', 'inactive')),
  uploads_enabled boolean default false not null,
  voting_enabled boolean default false not null,
  start_date timestamptz,
  end_date timestamptz,
  created_by text references users(id) on delete set null
);
```

#### Taula: `photo_submissions` (Fotos enviades a concurs)
```sql
create table photo_submissions (
  id text primary key,
  "userId" text references users(id) on delete cascade not null,
  "objectiveId" text references objectives(id) on delete cascade not null,
  "fileName" text not null,
  url text not null, -- Enllaç CDN a Cloudinary
  "originalUrl" text,
  "fileSize" text,
  published boolean default false not null, -- requereix vistiplau gestor
  revealed boolean default false not null,
  submitted_at timestamptz default now(),
  unique ("userId", "objectiveId") -- límit estricte: 1 foto per repte actiu
);
```

#### Taula: `votes` (Puntuacions de vots a tres columnes)
```sql
create table votes (
  id text primary key, -- p. ex: `vote_userId_photoId`
  "userId" text references users(id) on delete cascade not null,
  "photoId" text references photo_submissions(id) on delete cascade not null,
  "objectiveId" text references objectives(id) on delete cascade not null,
  creativity integer check (creativity between 0 and 5) not null,
  theme integer check (theme between 0 and 5) not null,
  composition integer check (composition between 0 and 5) not null,
  created_at timestamptz default now()
);
```

#### Taula: `settings` (Configuració de botons i bloquejos de Reptes)
Controla la visibilitat dinàmica de botons sobre les pantalles dels participants de Reptes si es vol fer tancaments extraordinaris en calent.
```sql
create table settings (
  id integer primary key generated by default as identity,
  uploads_enabled boolean default true not null,
  voting_enabled boolean default true not null,
  names_revealed boolean default false not null,
  ranking_hidden boolean default false not null,
  force_hide_upload boolean default false not null,
  force_hide_vote boolean default false not null,
  force_hide_resultats boolean default false not null,
  force_hide_classificacio boolean default false not null
);
```

### 2.3. Taules Específiques del Circuit "Premis Zampa"

#### Taula: `zampa_editions` (Edicions anyals i control de fluxos)
Determina en quin dels quatre estats d'edició globals es troba el concurs anual de portafolis Zampa.
```sql
create table zampa_editions (
  id integer primary key, -- Any de l'edició (ex: 2026)
  status text default 'open' not null check (status in ('open', 'vote', 'closed', 'finished')),
  official_winner_adult text -- Clau de projecte referenciat pel jurat de la nit (Zampa de l'Any)
);
```

#### Taula: `zampa_projects` (Portafolis artístics o carpetes seleccionades)
```sql
create table zampa_projects (
  id text primary key,
  edition_year integer references zampa_editions(id) on delete cascade not null,
  category text default 'adult' not null check (category in ('adult')),
  author_name text not null,
  project_title text not null,
  description text,
  popular_rank_position integer, -- posició final verídica obtinguda a la votació popular de la sala
  submitted_at timestamptz default now()
);
```

#### Taula: `zampa_photos` (Fotos associades a cada portafoli de Zampa)
```sql
create table zampa_photos (
  id text primary key,
  project_id text references zampa_projects(id) on delete cascade not null,
  file_url text not null, -- URL directa amb processat gràfic
  file_name text,
  photo_title text,
  description text,
  order_index integer not null -- índex estricte de presentació dins del mosaic d'autor
);
```

#### Taula: `zampa_user_ranks` (Travesses i mides d'ordenació de socis)
Emmagatzema el podi particular (`1` a `N`) triat per cada soci durant la nit.
```sql
create table zampa_user_ranks (
  id integer primary key generated by default as identity,
  user_id text references users(id) on delete cascade not null,
  project_id text references zampa_projects(id) on delete cascade not null,
  edition_year integer not null,
  category text not null default 'adult' check (category in ('adult')),
  assigned_position integer not null, -- posició dins de l'ordre del podi d'usuari
  submitted_at timestamptz default now(),
  unique (user_id, project_id)
);
```

---

## 3. Gestió de Mitjans i Processat d'Imatges (Cloudinary)

S'utilitza una integració directa en client amb **Cloudinary** que protegeix la quantitat de dades i de fitxers intercanviats:
*   **Directori d'allotjament de Reptes**: `FemReptes/{tematica_sanititzada}`
*   **Directori d'allotjament de Zampa**: `FemReptes/Zampa_{any}/{nom_autor}`
*   **Directori d'allotjament del perfil**: `FemReptes/Profiles`

### Algorisme de Compressió Seqüencial i Privadesa (EXIF intacte)
Abans de ser tramesa l'any o projecte, cada imatge és interceptada per un Canvas de HTML5:
1.  **Reajust d'escala**: Es comprova si supera el màxim alt/ample de **4800px × 4800px**. Les imatges més grans es redueixen mantenint la relació d'aspecte, garantint que el fitxer conservi la definició necessària per a impressions físiques professionals a la sala, reduint fins a un 75% l'ample de banda de pujada.
2.  **Qualitat**: Es codifica en format JPEG a un nivell controlat del **88%** (`0.88`).
3.  **Filtrat d'EXIF per privadesa mèdica**: Utilitzant `piexifjs`, es desmunta la metadada de la imatge i **s'extirpen totes les coordenades GPS fotogràfiques**. Això garanteix que la ubicació de la residència o activitat particular dels autors no quedi exposada a la xarxa, mentre que la informació de càmera (ISO, focal, diafragma, etc.) s'injecta novament per no danyar la informació de la fotografia.

---

## 4. Algorismes de Càlcul de Puntuacions i Rànquings

El programari aplica models aritmètics completament paral·lels per a resoldre els resultats dels dos tipus de concurs:

### 4.1. Algorisme de Puntuació i Empats del Concurs de "Reptes"

#### 1. Determinació de Vots Visius Homologats
Només es tenen en compte en la comptabilitat les valoracions de socis que hagin finalitzat completament la seva col·laboració (enregistrat amb dades `es_esborrany = false` a la taula `seguiment_votacio`).
Si un soci homologat deixa sense omplir o avaluar algunes imatges del mosaic, el criteri rep automàticament un valor de `0` estrelles, penalitzant la mitjana de forma justa en lloc d'estalviar la seva nota.

#### 2. Càlcul de Punts per Foto
Cada imatge rep una valoració corresponent a la mitjana aritmètica de les tres mitges directes per criteris:
$$\text{Mitjana Criteri } (C) = \frac{\sum \text{puntuacions d'usuaris per } C}{\text{Nombre total d'usuaris que han tancat la plantilla}}$$

$$\text{Puntuació de la Foto} = \frac{\text{Mitjana Creativitat} + \text{Mitjana Temàtica} + \text{Mitjana Composició}}{3}$$

#### 3. Regles de Consolidació de Punts al Rànquing General (Taula Anual)
En tancar-se la temàtica per part del panell (`finalizeObjective`), la posició es tradueix en punts segons la graella predefinida del rànquing general de la FEM pels 10 primers (1r: 25p, 2n: 18p, 3r: 15p... fins a 10è: 4p).

*   **Mitjana de Punts Ex Aequo Generosa**: Si dos socis empaten a la posició `X`, reben **tots dos el 100% de la puntuació regulada per a aquest lloc**. No es dilueix el mèrit fotogràfic compartit.
*   **Ajust Consecutiu Sense Salt de Rangs**: El llistat d'escriptura no salta posicions per empats previs. Si hi ha un empat en el 3r lloc (dos usuaris sumen 15 punts), el següent classificant serà immediatament considerat com a 4t classificant (rebent 12 punts), en lloc del 5è.
*   **Posicions inferiors (>= 11)**: Reben un punt de col·laboració residual acompanyat d'una fracció decimal decrescent per mantenir la coherència de l'històric general:
$$\text{Punts d'Ajuda} = 1.01 - \frac{\text{Posició} - 10}{10000}$$

---

### 4.2. Algorisme d'Afinitats i Comparatives dels "Premis Zampa"

En lloc de comptar amb una mitjana lineal senzilla, els Premis Zampa apliquen dos indicadors de creuament de dades amb perspectiva soci-grup:

#### A) El Punt de Mira Oficial (Proximitat temporal al Tribunal de l'Any)
Mesura com d'aproximat s'ha quedat cada soci al veredicte emès pel jurat sota votació oficial:
*   Es tria quin és l'ID del projecte proclamat guanyador absolut pel Tribunal Oficial de la FEM de la nit.
*   S'analitza en quina posició exacta de la llista individual de cada soci s'havia col·locat el projecte guanyador.
*   Es llista de forma ordenada de millor a pitjor: a dalt els socis que el van col·locar 1r (encert complet), seguits d'aquells que el van col·locar 2n, 3r, etc.

#### B) L'Afinitat Popular (Desviació Absoluta o Distància Manhattan)
Calcula quina és l'empat global o proximitat del gust personal del soci amb el veredicte general expressat pel públic que ha vist l'exposició a la sala de dalt, calculant la suma total de l'error posicional absolut en tots els projectes llistats:
$$G = \sum_{p=1}^{N} |S_{p} - P_{p}|$$

*   $S_{p}$: Posició en la que el soci en curs va col·locar el projecte d'autor $p$.
*   $P_{p}$: Posició real en la que s'ha situat el projecte $p$ dins de la classificació del vot del Públic (establerta per l'admin a la taula `zampa_projects.popular_rank_position`).
*   **Veredicte**: Els socis es classifiquen de forma transparent de menor a major distància $G$. El primer lloc d'aquesta llista destaca el soci amb l'ull de gust més alineat amb la majoria de la sala de la FEM.

---

## 5. Fluxos de Treball i Interaccions de l'Usuari (UX/UI)

### 5.1. Sincronització Intel·ligent de Recursos (Light Polling)
Per tal de prescindir de múltiples i costosos canals en viu (WebSockets o crides de real-time obertes), l'aplicació s'auto-audita cada **30 segons** en segon pla:
1.  Realitza dues o tres consultes d'alta velocitat sobre Supabase (`COUNT` d'imatges d'objectiu actiu, d'estat de vots totals, i de la taula `settings`).
2.  Interpreta els valors retornats en una cadena de bit de canvi compacte (ex: `false|420|14|open`).
3.  Si la cadena de canvi no varia amb dades de memòria local, la pàgina conserva el flux d'atenció actual del soci de forma ininterrompuda. Però si s'identifica algun canvi en les llistes o canvis d'estats de l'administració, es força dinàmicament `loadAllData` per garantir un escriptori actualitzat.

### 5.2. L'Elegància de la Reordenació d'Autors a Zampa (Híbrid ▲/▼ i Dropdown)
L'edició del podi de Zampa compta amb un disseny de resguard complet adaptat a ecrans de mòbils i ordinadors:
*   **Comandament Dual**: Es dóna la opció d'utilitzar accions de fletxes ▲/▼ d'un esglaó, o bé un canvi dinàmic via desplegable numèric directe (`Dropdown Selector 1..N`). En triar una posició exactament, el software de Zampa desplaça el projecte ràpidament i re-calcula la totalitat de posicions de les altres línies per estalviar clics farragosos.
*   **Enquadrament Actiu (Visual Highlight & Focus Tracking)**: En moure's un element, s'executa un moviment automàtic i suau (`scrollIntoView` interactiu) que reté la visualització centrada en la targeta del projecte, la qual s'il·lumina d'un blau elèctric elegant amb augment d'escala per impedir qualsevol desubicació espacial dels socis en llistats amplis.

### 5.3. Interfícies Nítides i Segures (Sense Alertes de Navegador)
*   **`ConfirmModal` Personalitzat**: L'aplicació ha erradicat qualsevol pop-up invasiu o rústic del sistema operatiu (`window.confirm` o alertes nates de navegador). Totes les validacions crítiques—com esborrar projectes o finalitzar el podi—estan estilitzades amb el disseny fosc de la FEM i en el nostre idioma.
*   **`FullscreenViewer` de Nivell Professional**: Qualsevol fotografia dels mosaics es pot maximitzar instantàniament en fons opacs amb l'eina `FullscreenViewer`. Aquest mòdul proporciona gestió nativa de zoom, descàrregues directes ràpides sota canvis d'escala fons nítids i desplaçament tàctil fluid en pantalles de mòbils evitant bloquejos fatals d'usabilitat.
