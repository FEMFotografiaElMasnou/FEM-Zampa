import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_CONFIGS = {
  normal: {
    url: 'https://ogqqcgbgcqowvywaolln.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncXFjZ2JnY3Fvd3Z5d2FvbGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTYzNTIsImV4cCI6MjA4OTA3MjM1Mn0.f4JGoy2BQmir9veKMp_Fk1GqjMGGbMr4YMUK1iH9wfM',
  }
};

const YEAR = 2026;
const BACKUP_DIR = path.join(process.cwd(), 'backup_zampa_2026');

async function run() {
  console.log(`🚀 Iniciant extracció i còpia de seguretat de dades per al Zampa ${YEAR}...`);
  
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const client = createClient(SUPABASE_CONFIGS.normal.url, SUPABASE_CONFIGS.normal.key);

  // 1. Edicions (zampa_editions)
  console.log('Fetching zampa_editions...');
  const { data: editions, error: errEditions } = await client
    .from('zampa_editions')
    .select('*')
    .eq('id', YEAR);
  if (errEditions) throw errEditions;
  fs.writeFileSync(path.join(BACKUP_DIR, 'zampa_editions.json'), JSON.stringify(editions, null, 2), 'utf-8');
  console.log(`✅ Desades ${editions?.length || 0} edicions.`);

  // 2. Projectes (zampa_projects)
  console.log('Fetching zampa_projects...');
  const { data: projects, error: errProjects } = await client
    .from('zampa_projects')
    .select('*')
    .eq('edition_year', YEAR);
  if (errProjects) throw errProjects;
  fs.writeFileSync(path.join(BACKUP_DIR, 'zampa_projects.json'), JSON.stringify(projects, null, 2), 'utf-8');
  console.log(`✅ Desats ${projects?.length || 0} projectes.`);

  // 3. Fotografies (zampa_photos)
  console.log('Fetching zampa_photos...');
  const projectIds = projects?.map(p => p.id) || [];
  let photos: any[] = [];
  if (projectIds.length > 0) {
    const { data: fetchedPhotos, error: errPhotos } = await client
      .from('zampa_photos')
      .select('*')
      .in('project_id', projectIds);
    if (errPhotos) throw errPhotos;
    photos = fetchedPhotos || [];
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'zampa_photos.json'), JSON.stringify(photos, null, 2), 'utf-8');
  console.log(`✅ Desades ${photos.length} fotografies de projectes (inclou URLs de Cloudinary).`);

  // 4. Votacions / Rànquings dels socis (zampa_user_ranks)
  console.log('Fetching zampa_user_ranks...');
  const { data: ranks, error: errRanks } = await client
    .from('zampa_user_ranks')
    .select('*')
    .eq('edition_year', YEAR);
  if (errRanks) throw errRanks;
  fs.writeFileSync(path.join(BACKUP_DIR, 'zampa_user_ranks.json'), JSON.stringify(ranks, null, 2), 'utf-8');
  console.log(`✅ Desats ${ranks?.length || 0} vots i podis individuals.`);

  // 5. Usuaris / Socis implicats (users)
  console.log('Fetching users involved in ranks...');
  const voterUserIds = Array.from(new Set(ranks?.map(r => r.user_id) || []));
  let users: any[] = [];
  if (voterUserIds.length > 0) {
    const { data: fetchedUsers, error: errUsers } = await client
      .from('users')
      .select('*')
      .in('id', voterUserIds);
    if (errUsers) throw errUsers;
    users = fetchedUsers || [];
  }
  fs.writeFileSync(path.join(BACKUP_DIR, 'users_involved.json'), JSON.stringify(users, null, 2), 'utf-8');
  console.log(`✅ Desats ${users.length} usuaris implicats (socis amb vot).`);

  // Generem també un fitxer CSV resum d'enllaços de les imatges per a descàrrega individual fàcil
  console.log('Generant resum d\'imatges en text...');
  let imageListText = 'project_id,project_title,author_name,photo_title,file_name,cloudinary_url\n';
  photos.forEach(p => {
    const proj = projects?.find(pr => pr.id === p.project_id);
    const title = proj ? proj.project_title.replace(/"/g, '""') : '';
    const author = proj ? proj.author_name.replace(/"/g, '""') : '';
    const photoTitle = p.photo_title ? p.photo_title.replace(/"/g, '""') : '';
    const fileName = p.file_name ? p.file_name.replace(/"/g, '""') : '';
    imageListText += `"${p.project_id}","${title}","${author}","${photoTitle}","${fileName}","${p.file_url}"\n`;
  });
  fs.writeFileSync(path.join(BACKUP_DIR, 'enllacos_imatges_cloudinary.csv'), imageListText, 'utf-8');
  console.log('✅ Generat fitxer CSV resum d\'enllaços de les imatges: enllacos_imatges_cloudinary.csv');

  console.log('\n🎉 EXTRACCIÓ COMPLETADA AMB ÈXIT!');
  console.log(`Trobareu tots els fitxers de dades a la carpeta: ${BACKUP_DIR}`);
}

run().catch(err => {
  console.error('❌ Error durant la extracció:', err);
});
