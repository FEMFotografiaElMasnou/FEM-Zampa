import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuració de connexió (es pot canviar per qualsevol altre entorn destí)
const TARGET_SUPABASE = {
  url: 'https://ogqqcgbgcqowvywaolln.supabase.co', // Posa aquí l'URL de la nova BD
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncXFjZ2JnY3Fvd3Z5d2FvbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTYzNTIsImV4cCI6MjA4OTA3MjM1Mn0.f4JGoy2BQmir9veKMp_Fk1GqjMGGbMr4YMUK1iH9wfM', // Clau 'anon' de la nova BD
};

const YEAR = 2026;
const BACKUP_DIR = __dirname; // El directori actual on resideix l'script

async function run() {
  console.log('🏁 Iniciant el procés de restauració i reconstrucció completa de dades...');
  
  const client = createClient(TARGET_SUPABASE.url, TARGET_SUPABASE.key);

  // Funcions auxiliars de lectura
  const readJSON = (filename: string) => {
    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`No s'ha trobat el fitxer de dades crític: ${filename}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  };

  // Carregar dades dels fitxers
  const editions = readJSON('zampa_editions.json');
  const projects = readJSON('zampa_projects.json');
  const photos = readJSON('zampa_photos.json');
  const ranks = readJSON('zampa_user_ranks.json');
  const users = readJSON('users_involved.json');

  console.log(`📋 S'han carregat les següents dades a memòria:`);
  console.log(` - ${users.length} Usuaris / Socis`);
  console.log(` - ${editions.length} Edició (Zampa ${YEAR})`);
  console.log(` - ${projects.length} Projectes d'autors`);
  console.log(` - ${photos.length} Imatges de portafolis`);
  console.log(` - ${ranks.length} Vots / Travesses individuals`);

  // --- PAS 1: RESTAURAR USUARIS ---
  console.log('\n👉 [PAS 1/5] Restaurant usuaris (socis)...');
  if (users.length > 0) {
    // Per a cada usuari, comprovem si ja existeix per ID o per correu
    const { data: existingUsers } = await client.from('users').select('id, email');
    const existingIds = new Set(existingUsers?.map(u => u.id) || []);
    const existingEmails = new Set(existingUsers?.map(u => u.email?.toLowerCase()) || []);

    const toInsert = users.filter((u: any) => !existingIds.has(u.id) && !existingEmails.has(u.email?.toLowerCase()));
    
    if (toInsert.length > 0) {
      console.log(`Inserint ${toInsert.length} nous usuaris...`);
      const { error } = await client.from('users').insert(toInsert);
      if (error) throw new Error(`Error restaurant usuaris: ${error.message}`);
    } else {
      console.log('Tots els usuaris ja existeixen o estan registrats a la base de dades destí.');
    }
  }

  // --- PAS 2: RESTAURAR EDICIONS ---
  console.log('\n👉 [PAS 2/5] Restaurant edició anual...');
  // Neteja de l'edició de l'any si ja existís, o actualització parcial
  const { data: existingEditions } = await client.from('zampa_editions').select('id').eq('id', YEAR);
  if (existingEditions && existingEditions.length > 0) {
    console.log(`L'edició Zampa ${YEAR} ja existeix. S'actualitzarà la seva informació.`);
    // En lloc d'esborrar (per clau forana), actualitzem el guanyador o estat
    const { error } = await client.from('zampa_editions').upsert(editions);
    if (error) throw new Error(`Error actualitzant edició: ${error.message}`);
  } else {
    const { error } = await client.from('zampa_editions').insert(editions);
    if (error) throw new Error(`Error restaurant edició: ${error.message}`);
  }

  // --- PAS 3: RESTAURAR PROJECTES ---
  console.log('\n👉 [PAS 3/5] Restaurant projectes d\'autors...');
  // Com que pot haver-hi canvis, esborrem els projectes anteriors d'aquest any actiu per fer un bolcat net (això fa on delete cascade a les fotos)
  console.log('Netejant dades de projectes antics d\'aquest any per evitar duplicats...');
  await client.from('zampa_projects').delete().eq('edition_year', YEAR);

  if (projects.length > 0) {
    const { error } = await client.from('zampa_projects').insert(projects);
    if (error) throw new Error(`Error restaurant projectes: ${error.message}`);
    console.log(`Inserits ${projects.length} projectes correctament.`);
  }

  // --- PAS 4: RESTAURAR FOTOGRAFIES ---
  console.log('\n👉 [PAS 4/5] Restaurant fotografies associades...');
  // Com que hem esborrat els projectes a dalt, les fotos antigues ja s'hauran netejat per clau forana 'on delete cascade'
  if (photos.length > 0) {
    const { error } = await client.from('zampa_photos').insert(photos);
    if (error) throw new Error(`Error restaurant fotografies: ${error.message}`);
    console.log(`Inserides ${photos.length} fotografies correctament.`);
  }

  // --- PAS 5: RESTAURAR VOTACIONS / PODIS ---
  console.log('\n👉 [PAS 5/5] Restaurant votacions dels socis...');
  // Netegem vots antics d'aquest any
  await client.from('zampa_user_ranks').delete().eq('edition_year', YEAR);

  if (ranks.length > 0) {
    const { error } = await client.from('zampa_user_ranks').insert(ranks);
    if (error) throw new Error(`Error restaurant votacions: ${error.message}`);
    console.log(`Inserides ${ranks.length} votacions de podi correctament.`);
  }

  console.log(`\n🎉 RECONSTRUCCIÓ COMPLETADA AMB ÈXIT!`);
  console.log(`L'edició Zampa ${YEAR} ha estat totalment reconstruïda amb tots els seus projectes, usuaris i vots de socis.`);
}

run().catch(err => {
  console.error('❌ Error durant la restauració:', err);
});
