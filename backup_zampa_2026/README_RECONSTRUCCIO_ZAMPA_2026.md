# 🏆 Manual de Reconstrucció Complet i Documentació Tècnica: Premis Zampa 2026

Aquest document és una **guia mestre de restauració de desastres i llibre d'arquitectura** dissenyat per a permetre a qualsevol desenvolupador o membre de la junta de la **FEM** reconstruir la totalitat de l'aplicació **Fem Votacions** i, específicament, l'edició **Premis Zampa 2026** des d'absolutament zero, recuperant tots els projectes, imatges, socis i vots de podis emesos.

---

## 📁 1. Inventari del Paquet de Seguretat (Backup 2026)

Dins d'aquesta carpeta (`/backup_zampa_2026/`) disposeu dels següents fitxers autònoms:

| Fitxer | Tipus | Descripció |
| :--- | :--- | :--- |
| **`zampa_editions.json`** | Dades JSON | El registre de l'edició 2026, l'estat actual (`finished`) i el guanyador triat pel tribunal oficial. |
| **`zampa_projects.json`** | Dades JSON | Els 10 projectes i portafolis artístics participants de la nit, amb títol, autor, i posició popular final de la sala. |
| **`zampa_photos.json`** | Dades JSON | Les 191 fotografies d'alta resolució dels mosaics individuals d'autor, incloent l'ordre de presentació de cadascuna i les URLs originals d'allotjament professional CDN. |
| **`zampa_user_ranks.json`**| Dades JSON | El **100% de vots i podis individuals** (190 registres) introduïts de forma fidedigna pels 19 socis participants. |
| **`users_involved.json`** | Dades JSON | El cens de seguretat dels 19 socis únics de la FEM que han emès vots en aquesta edició (credencials, noms de pantalla, rols, etc.). |
| **`enllacos_imatges_cloudinary.csv`** | Llistat CSV | Resum d'imatges ordenat per autor i títol amb els enllaços directes a la CDN. Molt útil per a descarregar-les massivament en un ordinador si calgués. |
| **`generate_zampa_2026_data_dumps.ts`** | Script TS | L'script automatitzat que hem utilitzat per realitzar aquesta còpia de seguretat en calent des de la base de dades de producció. |
| **`restore_zampa_2026.ts`** | Script TS | **L'eina automatitzada de reconstrucció**. Importa de manera intel·ligent les dades de dalt en qualsevol base de dades buida de Supabase. |

---

## ⚙️ 2. Arquitectura de l'Aplicació i Estructura de Fitxers

L'aplicació és una Single Page Application (SPA) dissenyada amb un model desacoblat de mòduls integrats a la barra superior (`topbar`).

### 2.1. Mapa de components al codi font:
*   **`/src/App.tsx` (L'Arrel/Orquestrador)**:
    *   Gestiona les sessions de seguretat, l'elecció de l'idioma (Català/Castellà), la commutació d'entorns de base de dades (Normal, Test, Pròpia).
    *   Despatxa visualment les pantalles mestre segons el mòdul triat per l'usuari: `Reptes Mensuals` o `Premis Zampa`.
    *   Carrega inicialment les col·leccions i gestiona el bloqueig dinàmic de canvis d'estat.
*   **`/src/components/ZampaParticipant.tsx` (Escriptori del Soci)**:
    *   Interfície de presentació de portafolis per als socis (Mosaic de fotografies interactives, visualització professional a pantalla completa).
    *   Conté el panell de selecció i posicionament dinàmic de podis (`1` a `10`) adaptat a mòbils (fletxes amunt/avall o selecció numèrica emergent).
    *   Conté l'apartat de resultats en temps real, que calcula l'afinitat individual de cada soci (Ull Clínic, Proximitat al Tribunal) un cop l'edició està tancada (`finished`).
*   **`/src/components/ZampaAdmin.tsx` (Panell d'Administració)**:
    *   Control d'estat de les edicions: *Obert per a vots* (`vote`), *Tancat provisional* (`closed`), o *Finalitzat oficialment* (`finished`).
    *   Formularis de creació i gestió de projectes, autors, i càrrega intel·ligent de mosaics complets d'imatges amb compressió de client.
    *   **Eina de Rèplica de Dades (Funció Volcat)**: Una consola d'enginyeria que permet clonar tota la configuració, usuaris de prova, mosaics i votacions des de la base de dades de proves (*Sandbox*) a la de producció (*Real*) en un sol clic amb anàlisi de conflictes previ.
*   **`/src/lib/supabaseClient.ts` (Motor de Dades)**:
    *   Declaració i commutació en calent de les credencials del servidor de persistència de dades.
*   **`/src/lib/cloudinary.ts` (Tractament d'Imatges)**:
    *   Codificació i connexió directa amb el servei CDN.
*   **`/src/components/FullscreenViewer.tsx` (Visor de Mosaics)**:
    *   Eina tàctil optimitzada amb gestió de gestos i desplaçament d'alta velocitat per a l'anàlisi de fotografies des d'escriptoris mòbils.

---

## 🗄️ 3. Estructura de la Base de Dades (SQL)

La base de dades s'estructura en un esquema de 5 taules per al mòdul Zampa, relacionades mitjançant claus foranes (`Foreign Keys`) d'esborrat en cascada (`ON DELETE CASCADE`):

```
                        ┌──────────────┐
                        │    users     │
                        └──────┬───────┘
                               │
                        ┌──────▼───────────┐
                        │  zampa_editions  │
                        └──────┬───────────┘
                               │
                        ┌──────▼───────────┐
                        │  zampa_projects  │
                        └──────┬─────┬─────┘
                               │     │
                ┌──────────────┘     └──────────────┐
                ▼                                   ▼
        ┌──────────────┐                    ┌──────────────┐
        │ zampa_photos │                    │zampa_usr_rnks│
        └──────────────┘                    └──────────────┘
```

### 3.1. DDL i Claus SQL de Referència:

```sql
-- 1. Taula de socis i administradors
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'participant' NOT NULL CHECK (role IN ('admin', 'participant')),
  zampa_role TEXT DEFAULT 'user' NOT NULL CHECK (zampa_role IN ('admin', 'editor', 'user')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Taula de control d'edicions
CREATE TABLE zampa_editions (
  id INTEGER PRIMARY KEY, -- Any de l'edició (ex: 2026)
  status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'vote', 'closed', 'finished')),
  official_winner_adult TEXT -- ID de projecte proclamat pel jurat de la nit
);

-- 3. Taula de portafolis d'autors
CREATE TABLE zampa_projects (
  id TEXT PRIMARY KEY,
  edition_year INTEGER REFERENCES zampa_editions(id) ON DELETE CASCADE NOT NULL,
  category TEXT DEFAULT 'adult' NOT NULL CHECK (category IN ('adult')),
  author_name TEXT NOT NULL,
  project_title TEXT NOT NULL,
  description TEXT,
  popular_rank_position INTEGER, -- Resolució final de votacions de la sala
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Taula de fotografies de portafolis
CREATE TABLE zampa_photos (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES zampa_projects(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT NOT NULL, -- URL directa amb processat gràfic CDN
  file_name TEXT,
  photo_title TEXT,
  description TEXT,
  order_index INTEGER NOT NULL -- Índex per retenir l'ordre estricte del mosaic d'autor
);

-- 5. Taula de podis individuals i travesses
CREATE TABLE zampa_user_ranks (
  id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  project_id TEXT REFERENCES zampa_projects(id) ON DELETE CASCADE NOT NULL,
  edition_year INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'adult' CHECK (category IN ('adult')),
  assigned_position INTEGER NOT NULL, -- Del 1 al 10 en la llista del soci
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, project_id)
);
```

---

## 🔐 4. Claus i Configuracions de l'Entorn (.env)

L'aplicació utilitza variables d'entorn al fitxer `.env` d'arrel per apuntar als serveis en línia de forma segura, o en el seu defecte hereta els paràmetres de fallback configurats transparentment:

### 4.1. Variables de Supabase (.env)
```env
# Clau pública anon d'accés a les API i crides de la base de dades
VITE_SUPABASE_URL=https://ogqqcgbgcqowvywaolln.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncXFjZ2JnY3Fvd3Z5d2FvbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTYzNTIsImV4cCI6MjA4OTA3MjM1Mn0.f4JGoy2BQmir9veKMp_Fk1GqjMGGbMr4YMUK1iH9wfM
```

### 4.2. Variables de Cloudinary (.env)
```env
# Nom del compte de Cloudinary on resideixen les imatges de qualitat professional
VITE_CLOUDINARY_CLOUD_NAME=femfotografia
# Preset de pujada sense contrasenya de seguretat autoritzada
VITE_CLOUDINARY_UPLOAD_PRESET=femfotografiapreset
```

---

## 🧮 5. Funcionament del Motor d'Afinitats i Votacions

Els càlculs d'afinitats s'executen en client a `ZampaParticipant.tsx` un cop l'administrador tanca l'edició (`status = 'finished'`).

### 5.1. Proximitat al Tribunal Oficial (Ull Clínic de la Nit)
Mesura en quin punt del seu propi podi va col·locar el soci el projecte que el jurat oficial va designar com a guanyador de la nit (`zampa_editions.official_winner_adult`):
*   Es localitza l'ID d'autor guanyador.
*   Es busca la posició `assigned_position` que aquest soci li havia donat a aquest ID en la taula `zampa_user_ranks`.
*   Els resultats es classifiquen de forma transparent, de manera que els socis que van col·locar el guanyador del tribunal en el seu lloc `1`, `2`, o `3` destaquen a la part alta de la llista de consens de l'agrupació.

### 5.2. L'Afinitat Popular (Desviació Manhattan)
S'utilitza l'algorisme de **Distància Manhattan** per mesurar quin soci té el gust personal més alineat amb el consens general de tota la sala. L'algorisme calcula el sumatori d'errors absoluts:
$$G = \sum_{p=1}^{N} |S_{p} - P_{p}|$$
*   On $S_{p}$ és el podi (1 al 10) que el soci li ha assignat a cada projecte $p$.
*   On $P_{p}$ és la posició real obtinguda a la classificació popular de la sala (introduït per l'administrador al camp `zampa_projects.popular_rank_position` un cop fet l'escrutini de les urnes).
*   **Resultat**: Es llisten els socis de menor a major valor de desviació $G$. Com més petita és la desviació, més s'assembla el vot d'aquell soci al criteri col·lectiu del jurat popular de la sala.

---

## 🛠️ 6. Guia de Reconstrucció des de Zero (Reconstruir Zampa 2026)

Si s'hagués de refer la totalitat del sistema des d'una base de dades totalment buida de Supabase:

### Pas 1: Preparar la Base de Dades
1. Creeu un nou projecte a **Supabase** (allotjament gratuït de PostgreSQL).
2. Aneu a la secció **SQL Editor** a la consola de Supabase.
3. Copieu el codi de la secció **`3.1. DDL i Claus SQL`** de dalt i executeu-lo. Això crearà les 5 taules buides i les seves relacions de claus foranes.

### Pas 2: Vincular l'Aplicació
1. Obriu l'arxiu d'entorn `.env` de la vostra aplicació React.
2. Modifiqueu les línies `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` amb les noves claus proporcionades per Supabase a la secció *Project Settings -> API*.

### Pas 3: Executar la Restauració de Dades del Zampa 2026
L'script `restore_zampa_2026.ts` carregarà automàticament els JSON i els introduirà a la nova base de dades respectant les dependències lògiques:
1. Obriu una terminal d'ordres al directori arrel del projecte.
2. Executeu l'ordre següent per llançar la restauració mitjançant el motor automàtic:
   ```bash
   npx tsx backup_zampa_2026/restore_zampa_2026.ts
   ```
3. L'script processarà els fitxers de dades un a un i mostrarà un informe visual de progés com aquest:
   ```text
   🏁 Iniciant el procés de restauració i reconstrucció completa de dades...
   📋 S'han carregat les següents dades a memòria:
    - 19 Usuaris / Socis
    - 1 Edició (Zampa 2026)
    - 10 Projectes d'autors
    - 191 Imatges de portafolis
    - 190 Vots / Travesses individuals

   👉 [PAS 1/5] Restaurant usuaris (socis)...
   👉 [PAS 2/5] Restaurant edició anual...
   👉 [PAS 3/5] Restaurant projectes d'autors...
   👉 [PAS 4/5] Restaurant fotografies associades...
   👉 [PAS 5/5] Restaurant votacions dels socis...

   🎉 RECONSTRUCCIÓ COMPLETADA AMB ÈXIT!
   ```

### Pas 4: Recuperació d'Imatges (Cloudinary)
*   Les fotografies del Zampa 2026 **no es perdran mai** perquè les seves URLs estan desades permanentment a la taula `zampa_photos` de Supabase i apunten directament al compte d'allotjament professional CDN de Cloudinary.
*   Si la FEM decidís migrar o canviar de compte de Cloudinary, es podria utilitzar el fitxer `enllacos_imatges_cloudinary.csv` inclòs en aquesta carpeta per a descarregar-les totes de manera local amb un gestor de descàrregues de fitxers i tornar-les a carregar sota la nova ruta de carpetes en qüestió de minuts.

---

## 🖥️ 7. Manual de Pantalles i Funcions Públicas / Admin

### 7.1. Pantalles i Operacions Públiques (Vista Soci)
*   **Targeta de l'Edició Activa**: Mostra el títol general del Zampa del present any.
*   **Selector de Portafolis Interactius**: Llista amb imatges en format graella on cada autor té la seva targeta amb la seva primera foto gran. En prémer-la, s'obre el mosaic complet de 10-15 imatges d'autor de forma fluida.
*   **Arrossegador / Selector de Posicions**: Permet configurar el podi fàcilment mitjançant canvis ràpids. Bloqueja o demana confirmació abans del tancament definitiu per evitar errors accidentals d'escriptura.
*   **Pantalla de Classificació de Consens**: Un cop l'admin finalitza, calcula i presenta en una pantalla professional la relació d'Afinitat Popular de la sala i l'afinitat de proximitat dels socis que més s'han acostat al Tribunal.

### 7.2. Pantalles i Operacions d'Administrador (Panell d'Admin)
*   **Modificació d'Estats de l'Any**: Controls ràpids per tancar l'edició i finalitzar-la des d'un sol lloc visualitzant el nombre de participants actius que tenen votacions en marxa.
*   **Creador Dinàmic d'Autors**: Permet donar d'alta nous fotògrafs d'exposició introduint el seu nom, títol i descripció conceptual dels seus treballs.
*   **Gestor d'Imatges**: Suporta la càrrega massiva d'imatges d'escriptori. Les imatges es processen automàticament en client, se'ls extirpa la metadada de geolocalització per privadesa mèdica, i es pugen optimitzades directament al compte de Cloudinary sota les carpetes d'autor unificades.

---
*Còpia de seguretat generada, validada i arxivada per l'aplicació FEM Votacions el 26 de Juny de 2026.*
