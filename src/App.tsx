import React, { useState, useEffect } from 'react';
import { getSupabaseClient, getCurrentMode, switchDbMode, setCustomConfig, clearCustomConfig, getActiveConfig, safeStorage } from './lib/supabaseClient';
import { t } from './lib/translations';
import {
  User,
  Objective,
  PhotoSubmission,
  Vote,
  AppSettings,
  ZampaEdition,
  ZampaProject,
  ZampaPhoto,
  ZampaUserRank
} from './types';
import ZampaAdmin from './components/ZampaAdmin';
import ZampaParticipant from './components/ZampaParticipant';
import FullscreenViewer from './components/FullscreenViewer';
import { compressImage, uploadToCloudinary } from './lib/cloudinary';
import {
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Check,
  Lock,
  Unlock,
  Settings,
  Users,
  Award,
  Image as ImageIcon,
  ThumbsUp,
  Camera,
  Layers,
  Sparkles,
  Globe,
  Database,
  RefreshCw,
  Eye,
  AlertTriangle,
  UserCheck,
  Trophy,
  PlusCircle,
  X,
  Menu,
  Upload
} from 'lucide-react';
import JSZip from 'jszip';

export default function App() {
  // DB Mode & Localization
  const [dbMode, setDbMode] = useState<'normal' | 'test' | 'custom'>(getCurrentMode());
  const [lang, setLang] = useState<'ca' | 'es'>('ca');
  const [dbError, setDbError] = useState<string | null>(null);

  // Custom Supabase Client Configuration modal
  const [showDbConfigModal, setShowDbConfigModal] = useState(false);
  const [customDbUrlInput, setCustomDbUrlInput] = useState(() => safeStorage.getItem('femvotacions_custom_url') || '');
  const [customDbKeyInput, setCustomDbKeyInput] = useState(() => safeStorage.getItem('femvotacions_custom_key') || '');

  // Authentication State
  const [session, setSession] = useState<{ user: User } | null>(() => {
    try {
      const saved = safeStorage.getItem('femvotacions_session');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error reading initial session:", e);
      return null;
    }
  });

  // State to manage the super mode display configuration
  const [isSuperModeEnabled, setIsSuperModeEnabled] = useState<boolean>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlParam = searchParams.get('super') === 'true' || searchParams.get('admin') === 'true';
      if (!urlParam) {
        localStorage.removeItem('femvotacions_super_view');
        return false;
      }
      localStorage.setItem('femvotacions_super_view', 'true');
      return true;
    } catch {
      return false;
    }
  });

  // Calculate if DB environment controls should be visible
  const showDbSelectors = isSuperModeEnabled || (session?.user && (session.user.role === 'admin' || session.user.zampa_role === 'editor'));

  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    try {
      const saved = safeStorage.getItem('femvotacions_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        const userRole = parsed.user?.role;
        const zampaRole = parsed.user?.zampa_role;
        return userRole === 'admin' || zampaRole === 'editor';
      }
      return false;
    } catch {
      return false;
    }
  });

  // Global Context Mode Switch: Reptes Monthly vs. Zampa
  const [activeContext, setActiveContext] = useState<'reptes' | 'zampa'>('zampa');

  // Shared Database states (Reptes)
  const [users, setUsers] = useState<User[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [photoSubmissions, setPhotoSubmissions] = useState<PhotoSubmission[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    uploads_enabled: true,
    voting_enabled: true,
    namesRevealed: false,
    rankingHidden: false,
    force_hide_upload: false,
    force_hide_vote: false,
    force_hide_resultats: false,
    force_hide_classificacio: false,
  });

  // Zampa Database states
  const [zampaEditions, setZampaEditions] = useState<ZampaEdition[]>([]);
  const [zampaProjects, setZampaProjects] = useState<ZampaProject[]>([]);
  const [zampaUserRanks, setZampaUserRanks] = useState<ZampaUserRank[]>([]);

  // UI / Navigation / Modals States
  const [loginTab, setLoginTab] = useState<'login' | 'register'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullnameInput, setFullnameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<string>('inici');
  const [zampaAdminSubTab, setZampaAdminSubTab] = useState<'zampa' | 'socis'>('zampa');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoaderOpen, setIsLoaderOpen] = useState(false);
  const [loaderText, setLoaderText] = useState('En procés...');

  // Forms / Dialogs States (Reptes)
  const [showPwdResetModal, setShowPwdResetModal] = useState(false);
  const [pwdResetUser, setPwdResetUser] = useState<User | null>(null);
  const [showNewPwdModal, setShowNewPwdModal] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');

  const [showAddObjectiveModal, setShowAddObjectiveModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [objTitle, setObjTitle] = useState('');
  const [objDesc, setObjDesc] = useState('');

  const [uploadProgress, setUploadProgress] = useState(false);
  const [selectedMainFile, setSelectedMainFile] = useState<File | null>(null);
  const [mainPhotoUploadUrl, setMainPhotoUploadUrl] = useState<string | null>(null);

  // Lightbox Viewers (Reptes)
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [lightboxList, setLightboxList] = useState<{ url: string; fileName?: string }[]>([]);
  const [lightboxStartIdx, setLightboxStartIdx] = useState(0);

  // Voting Inputs (Reptes)
  const [votesInput, setVotesInput] = useState<Record<string, { creativity: number; theme: number; composition: number }>>({});

  // Mobile menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Alert/Toast helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Switch database environments dynamically
  const handleDbModeSwitch = (mode: 'normal' | 'test' | 'custom') => {
    if (mode === 'custom') {
      const savedUrl = safeStorage.getItem('femvotacions_custom_url');
      if (!savedUrl) {
        setCustomDbUrlInput(safeStorage.getItem('femvotacions_custom_url') || '');
        setCustomDbKeyInput(safeStorage.getItem('femvotacions_custom_key') || '');
        setShowDbConfigModal(true);
        return;
      }
    }
    setDbMode(mode);
    switchDbMode(mode);
    showToast(`Base de dades canviada a: ${mode.toUpperCase()} 🔄`);
    // Force clean cache / refresh state
    setSession(null);
    safeStorage.removeItem('femvotacions_session');
    window.location.reload();
  };

  // Global loading
  const loadDatabaseState = async () => {
    const client = getSupabaseClient();
    let usersSuccess = false;

    // Users
    try {
      const { data: userData, error } = await client.from('users').select('*');
      if (error) throw error;
      if (userData) {
        setUsers(userData);
        usersSuccess = true;
      }
    } catch (err) {
      console.warn("Could not load users table:", err);
    }

    // Objectives
    try {
      const { data: objData, error } = await client.from('objectives').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (objData) setObjectives(objData);
    } catch (err) {
      console.warn("Could not load objectives table:", err);
    }

    // Submissions
    try {
      const { data: subsData, error } = await client.from('photo_submissions').select('*');
      if (error) throw error;
      if (subsData) setPhotoSubmissions(subsData);
    } catch (err) {
      console.warn("Could not load photo_submissions table:", err);
    }

    // Votes
    try {
      const { data: votesData, error } = await client.from('votes').select('*');
      if (error) throw error;
      if (votesData) setVotes(votesData);
    } catch (err) {
      console.warn("Could not load votes table:", err);
    }

    // Settings
    try {
      const { data: settingsData, error } = await client.from('settings').select('*');
      if (error) throw error;
      if (settingsData && settingsData.length > 0) {
        const s = settingsData[0];
        setAppSettings({
          uploads_enabled: s.uploads_enabled,
          voting_enabled: s.voting_enabled,
          namesRevealed: s.names_revealed,
          rankingHidden: s.ranking_hidden,
          force_hide_upload: s.force_hide_upload || false,
          force_hide_vote: s.force_hide_vote || false,
          force_hide_resultats: s.force_hide_resultats || false,
          force_hide_classificacio: s.force_hide_classificacio || false,
        });
      }
    } catch (err) {
      console.warn("Could not load settings table:", err);
    }

    // Zampa Editions
    try {
      const { data: zEditions, error } = await client.from('zampa_editions').select('*').order('id', { ascending: false });
      if (error) throw error;
      if (zEditions) setZampaEditions(zEditions);
    } catch (err) {
      console.warn("Could not load zampa_editions table:", err);
    }

    // Zampa Projects + photos
    try {
      const { data: zProjects, error } = await client.from('zampa_projects').select('*').order('submitted_at', { ascending: true });
      if (error) throw error;
      if (zProjects) {
        // Fetch all photos
        const { data: zPhotos } = await client.from('zampa_photos').select('*').order('order_index', { ascending: true });
        
        // Match photos into array list inside project
        const formattedProjects: ZampaProject[] = zProjects.map(proj => ({
          ...proj,
          photos: zPhotos ? zPhotos.filter((ph: any) => ph.project_id === proj.id) : [],
        }));
        setZampaProjects(formattedProjects);
      }
    } catch (err) {
      console.warn("Could not load zampa_projects or photos table:", err);
    }

    // Zampa User ranks
    try {
      const { data: zRanks, error } = await client.from('zampa_user_ranks').select('*');
      if (error) throw error;
      if (zRanks) setZampaUserRanks(zRanks);
    } catch (err) {
      console.warn("Could not load zampa_user_ranks table:", err);
    }

    if (!usersSuccess) {
      const activeCfg = getActiveConfig();
      setDbError(`No s'ha pogut connectar a la taula 'users' a "${activeCfg.url}". Si us plau, confirma que has triat la teva base de dades pròpia ó bé afegeix les teves claus en fer clic sobre el botó Configuració.`);
    } else {
      setDbError(null);
    }
  };

  useEffect(() => {
    loadDatabaseState();
  }, [dbMode]);

  // Auth: Log In Action
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) {
      showToast(t('pass_required', lang));
      return;
    }

    setIsLoaderOpen(true);
    setLoaderText(t('connecting', lang));

    try {
      const match = users.find(
        (u) => {
          const emailMatch = u.email && u.email.toLowerCase().trim() === usernameInput.toLowerCase().trim();
          const displayNameMatch = u.display_name && u.display_name.toLowerCase().trim() === usernameInput.toLowerCase().trim();
          const passMatch = u.password && u.password.trim() === passwordInput.trim();
          return (emailMatch || displayNameMatch) && passMatch;
        }
      );

      if (match) {
        setSession({ user: match });
        safeStorage.setItem('femvotacions_session', JSON.stringify({ user: match }));
        setIsAdminMode(match.role === 'admin' || match.zampa_role === 'editor');
        showToast(t('welcome', lang) + ` ${match.display_name}! 👋`);
        
        // Reset inputs
        setUsernameInput('');
        setPasswordInput('');
        
        // Check if password has been reset
        if (passwordInput === '1234') {
          setShowNewPwdModal(true);
        }
      } else {
        showToast('❌ Usuari o contrasenya incorrectes');
      }
    } catch (err) {
      showToast('❌ Error de connexió amb la base de dades');
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Auth: Register/Sign up Action
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullnameInput || !emailInput || !passwordInput) {
      showToast(t('name_email_required', lang));
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      showToast('❌ Les contrasenyes no coincideixen');
      return;
    }

    const emailExists = users.some((u) => u.email.toLowerCase() === emailInput.toLowerCase());
    if (emailExists) {
      showToast(t('email_exists', lang));
      return;
    }

    setIsLoaderOpen(true);
    setLoaderText(t('creating_account', lang));

    try {
      const client = getSupabaseClient();
      const newUser: User = {
        id: 'usr_' + Date.now(),
        display_name: fullnameInput,
        email: emailInput,
        password: passwordInput,
        role: 'participant',
        zampa_role: 'user',
      };

      const { error } = await client.from('users').insert([newUser]);
      if (error) throw error;

      // Update state
      setUsers(prev => [...prev, newUser]);
      setSession({ user: newUser });
      safeStorage.setItem('femvotacions_session', JSON.stringify({ user: newUser }));
      setIsAdminMode(false);
      showToast(t('account_created', lang));

      // Reset
      setFullnameInput('');
      setEmailInput('');
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    safeStorage.removeItem('femvotacions_session');
    setIsAdminMode(false);
    setActiveTab('inici');
    showToast('Sessió tancada correctament 👋');
  };

  // New Password override (after admin reset)
  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      showToast(t('new_pwd_short', lang));
      return;
    }
    if (newPassword !== newPasswordRepeat) {
      showToast(t('new_pwd_mismatch', lang));
      return;
    }

    setIsLoaderOpen(true);
    setLoaderText(t('saving_cloud', lang));

    try {
      if (!session?.user) return;
      const client = getSupabaseClient();
      const { error } = await client
        .from('users')
        .update({ password: newPassword })
        .eq('id', session.user.id);

      if (error) throw error;

      // Update state
      setUsers(prev => prev.map(u => u.id === session.user.id ? { ...u, password: newPassword } : u));
      setSession(prev => prev ? { user: { ...prev.user, password: newPassword } } : null);
      setShowNewPwdModal(false);
      setNewPassword('');
      setNewPasswordRepeat('');
      showToast('✓ Contrasenya actualitzada correctament');
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // --- REPTES ACTIONS / CONTROLS ---

  // Create or Edit monthly themed subject
  const handleSaveObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objTitle) {
      showToast(t('title_required', lang));
      return;
    }

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      if (editingObjective) {
        // Edit
        const { error } = await client
          .from('objectives')
          .update({ title: objTitle, description: objDesc })
          .eq('id', editingObjective.id);

        if (error) throw error;
        setObjectives(prev => prev.map(o => o.id === editingObjective.id ? { ...o, title: objTitle, description: objDesc } : o));
        showToast(t('objective_saved', lang));
      } else {
        // Create new
        const activeCount = objectives.filter(o => o.status === 'active').length;
        if (activeCount > 0) {
          showToast(t('objective_already_active', lang));
          setIsLoaderOpen(false);
          return;
        }

        const newObj: Objective = {
          id: 'obj_' + Date.now(),
          title: objTitle,
          description: objDesc,
          status: 'active',
          uploads_enabled: true,
          voting_enabled: false,
        };

        const { error } = await client.from('objectives').insert([newObj]);
        if (error) throw error;
        setObjectives(prev => [newObj, ...prev]);
        showToast(t('objective_saved', lang));
      }

      setShowAddObjectiveModal(false);
      setEditingObjective(null);
      setObjTitle('');
      setObjDesc('');
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Finalize Active Theme Concurs
  const handleFinalizeObjective = async (objId: string) => {
    const ok = window.confirm(t('confirm_finalize_msg', lang));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client
        .from('objectives')
        .update({ status: 'finished', uploads_enabled: false, voting_enabled: false })
        .eq('id', objId);

      if (error) throw error;

      setObjectives(prev => prev.map(o => o.id === objId ? { ...o, status: 'finished', uploads_enabled: false, voting_enabled: false } : o));
      showToast(t('objective_finalized', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleDeleteObjective = async (objId: string) => {
    const obj = objectives.find(o => o.id === objId);
    if (!obj) return;
    const ok = window.confirm(t('confirm_delete_objective', lang).replace('{name}', obj.title));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('objectives').delete().eq('id', objId);
      if (error) throw error;

      setObjectives(prev => prev.filter(o => o.id !== objId));
      showToast(t('objective_deleted', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Upload Photo for active challenge
  const handleUploadMainPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const activeObj = objectives.find(o => o.status === 'active');
    if (!activeObj) {
      showToast(t('no_active_objective', lang));
      return;
    }

    setUploadProgress(true);
    try {
      const compressed = await compressImage(file);
      const folder = `FemReptes/Reptes_${activeObj.title.replace(/\s+/g, '_')}`;
      const url = await uploadToCloudinary(compressed, folder);

      const client = getSupabaseClient();
      const newSubmission: PhotoSubmission = {
        id: 'sub_' + Date.now(),
        userId: session!.user.id,
        objectiveId: activeObj.id,
        fileName: file.name,
        url: url,
        published: false,
        revealed: false,
      };

      const { error } = await client.from('photo_submissions').insert([newSubmission]);
      if (error) throw error;

      setPhotoSubmissions(prev => [...prev, newSubmission]);
      showToast(t('photo_uploaded', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleDeleteMainSubmission = async (subId: string) => {
    const ok = window.confirm(t('confirm_delete_photo_msg', lang));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('photo_submissions').delete().eq('id', subId);
      if (error) throw error;

      setPhotoSubmissions(prev => prev.filter(s => s.id !== subId));
      showToast(t('photo_deleted', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Admin approvals / publishes monthly photos
  const handlePublishAllPhotos = async () => {
    const activeObj = objectives.find(o => o.status === 'active');
    if (!activeObj) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client
        .from('photo_submissions')
        .update({ published: true })
        .eq('objectiveId', activeObj.id);

      if (error) throw error;

      setPhotoSubmissions(prev => prev.map(s => s.objectiveId === activeObj.id ? { ...s, published: true } : s));
      showToast(t('photos_deleted', lang)); // Key has approving value
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Participant Voting for active monthly theme
  const saveVotes = async () => {
    const activeObj = objectives.find(o => o.status === 'active');
    if (!activeObj) return;

    setIsLoaderOpen(true);
    setLoaderText(t('saving_votes_loader', lang));

    try {
      const client = getSupabaseClient();
      const newVotesPayload: Vote[] = [];

      Object.entries(votesInput).forEach(([photoId, v]: [string, any]) => {
        if (!session?.user) return;
        newVotesPayload.push({
          id: `vote_${session.user.id}_${photoId}`,
          userId: session.user.id,
          photoId,
          objectiveId: activeObj.id,
          creativity: v.creativity,
          theme: v.theme,
          composition: v.composition,
        });
      });

      // Batch insert or replacement
      const { error } = await client.from('votes').upsert(newVotesPayload);
      if (error) throw error;

      // Update state
      setVotes(prev => {
        const sansUpdated = prev.filter(v => v.userId !== session?.user.id || v.objectiveId !== activeObj.id);
        return [...sansUpdated, ...newVotesPayload];
      });

      showToast(t('votes_saved', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Settings modification
  const updateSettingsProperty = async (prop: keyof AppSettings, value: boolean) => {
    setAppSettings(prev => ({ ...prev, [prop]: value }));
    try {
      const client = getSupabaseClient();
      const { data: dbSets } = await client.from('settings').select('id');
      
      const mappedDbKey = 
        prop === 'namesRevealed' ? 'names_revealed' :
        prop === 'rankingHidden' ? 'ranking_hidden' : prop;

      if (dbSets && dbSets.length > 0) {
        await client.from('settings').update({ [mappedDbKey]: value }).eq('id', dbSets[0].id);
      } else {
        await client.from('settings').insert([{ [mappedDbKey]: value }]);
      }
    } catch (err) {
      console.warn("Could not save settings profile online:", err);
    }
  };

  // Reset member password
  const handleResetMemberPwd = async (user: User) => {
    const ok = window.confirm(t('member_reset_confirm_msg', lang).replace('{name}', user.display_name));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client
        .from('users')
        .update({ password: '1234' })
        .eq('id', user.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, password: '1234' } : u));
      showToast(t('member_reset_done', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Delete Member Account
  const handleDeleteMember = async (user: User) => {
    if (user.id === session?.user.id) {
      showToast(t('no_delete_self', lang));
      return;
    }
    const ok = window.confirm(t('confirm_delete_member', lang).replace('{name}', user.display_name));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('users').delete().eq('id', user.id);
      if (error) throw error;

      setUsers(prev => prev.filter(u => u.id !== user.id));
      showToast(t('member_deleted', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // Inline updates for users name
  const handleUpdateMemberName = async (userId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('users').update({ display_name: newName }).eq('id', userId);
      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, display_name: newName } : u));
      showToast(t('name_updated', lang));
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Inline updates for users zampa_role
  const handleUpdateMemberZampaRole = async (userId: string, newZampaRole: string) => {
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('users').update({ zampa_role: newZampaRole }).eq('id', userId);
      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, zampa_role: newZampaRole as any } : u));
      showToast("Rol de Zampa actualitzat correctament. 👍");
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Action for closing monthly votations
  const handleCloseVotingsAndReveal = async () => {
    const activeObj = objectives.find(o => o.status === 'active');
    if (!activeObj) return;

    const ok = window.confirm(t('confirm_close_voting_msg', lang));
    if (!ok) return;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      // Update app settings in DB
      await updateSettingsProperty('namesRevealed', true);
      await updateSettingsProperty('voting_enabled', false);

      // Reveal photo names
      const { error } = await client
        .from('photo_submissions')
        .update({ revealed: true })
        .eq('objectiveId', activeObj.id);

      if (error) throw error;

      setPhotoSubmissions(prev => prev.map(s => s.objectiveId === activeObj.id ? { ...s, revealed: true } : s));
      showToast(t('voting_closed_revealed', lang));
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // --- ZIP EXPORT COMPILER ---
  const handleExportZip = async () => {
    const activeObj = objectives.find(o => o.status === 'active');
    if (!activeObj) return;

    setIsLoaderOpen(true);
    setLoaderText('Exportant ZIP...');

    try {
      const zip = new JSZip();
      const currentSubs = photoSubmissions.filter(s => s.objectiveId === activeObj.id);

      for (let i = 0; i < currentSubs.length; i++) {
        const sub = currentSubs[i];
        const user = users.find(u => u.id === sub.userId);
        const name = user ? user.display_name.replace(/\s+/g, '_') : `Autor_${sub.userId}`;
        
        const res = await fetch(sub.url);
        const blob = await res.blob();
        zip.file(`${name}_${sub.fileName}`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `Votacions_FEM_${activeObj.title.replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('✓ ZIP exportat correctament');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
    }
  };

  // --- ZAMPA CRUD ACTIONS ---
  const handleInitZampaEdition = async (year: number): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const newEdition: ZampaEdition = {
        id: year,
        status: 'open',
      };

      const { error } = await client.from('zampa_editions').insert([newEdition]);
      if (error) throw error;

      setZampaEditions(prev => [newEdition, ...prev]);
      showToast(`Edició Zampa ${year} inicialitzada amb èxit! 🎉`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleUpdateZampaEditionStatus = async (status: ZampaEdition['status'], winnerAdult?: string | null): Promise<boolean> => {
    const currentYearEdition = zampaEditions[0];
    if (!currentYearEdition) return false;

    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const payload: any = { status };
      if (winnerAdult !== undefined) payload.official_winner_adult = winnerAdult;

      const { error } = await client
        .from('zampa_editions')
        .update(payload)
        .eq('id', currentYearEdition.id);

      if (error) throw error;

      setZampaEditions(prev => prev.map(e => e.id === currentYearEdition.id ? { ...e, ...payload } : e));
      showToast(`Edició canviada a l'estat ${status.toUpperCase()} 🌟`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleSaveZampaProject = async (proj: Partial<ZampaProject>): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      if (proj.id) {
        // Update
        const { error } = await client
          .from('zampa_projects')
          .update({
            author_name: proj.author_name,
            project_title: proj.project_title,
            description: proj.description,
            category: proj.category,
          })
          .eq('id', proj.id);

        if (error) throw error;

        setZampaProjects(prev => prev.map(p => p.id === proj.id ? { ...p, ...proj } : p));
        showToast(`Projecte de ${proj.author_name} editat correctament ✅`);
      } else {
        // Insert
        const id = 'zp_proj_' + Date.now();
        const newProj: ZampaProject = {
          id,
          edition_year: proj.edition_year!,
          category: proj.category || 'adult',
          author_name: proj.author_name!,
          project_title: proj.project_title!,
          description: proj.description || '',
          submitted_at: new Date().toISOString(),
        };

        const { error } = await client.from('zampa_projects').insert([newProj]);
        if (error) throw error;

        // Init blank photos array
        (newProj as any).photos = [];
        setZampaProjects(prev => [...prev, newProj]);
        showToast(`Nou projecte per a ${proj.author_name} creat! 🚀`);
      }
      return true;
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleDeleteZampaProject = async (projId: string): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('zampa_projects').delete().eq('id', projId);
      if (error) throw error;

      setZampaProjects(prev => prev.filter(p => p.id !== projId));
      showToast(`Projecte eliminat correctament ✅`);
      return true;
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleSaveZampaPhoto = async (photo: Partial<ZampaPhoto>): Promise<boolean> => {
    try {
      const client = getSupabaseClient();
      // Quick check if exists, otherwise upsert
      const { data } = await client.from('zampa_photos').select('id').eq('id', photo.id!);
      
      const { error } = await client.from('zampa_photos').upsert({
        id: photo.id,
        project_id: photo.project_id,
        file_url: photo.file_url,
        file_name: photo.file_name,
        photo_title: photo.photo_title,
        description: photo.description,
        order_index: photo.order_index,
      });

      if (error) throw error;

      // Update state local project photos array
      setZampaProjects(prev => prev.map(p => {
        if (p.id !== photo.project_id) return p;
        
        const existingPhotos = (p as any).photos || [];
        const foundIdx = existingPhotos.findIndex((ph: any) => ph.id === photo.id);
        
        let updatedPhotos = [];
        if (foundIdx > -1) {
          updatedPhotos = existingPhotos.map((ph: any) => ph.id === photo.id ? { ...ph, ...photo } : ph);
        } else {
          updatedPhotos = [...existingPhotos, photo];
        }
        
        return { ...p, photos: updatedPhotos };
      }));

      showToast(`Foto de mosaic desada correctament ✅`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    }
  };

  const handleDeleteZampaPhoto = async (photoId: string): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('zampa_photos').delete().eq('id', photoId);
      if (error) throw error;

      setZampaProjects(prev => prev.map(p => {
        const existingPhotos = (p as any).photos || [];
        return { ...p, photos: existingPhotos.filter((ph: any) => ph.id !== photoId) };
      }));

      showToast(`Foto del mosaic eliminada correctament ✅`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleSavePopularRanks = async (ranks: Record<string, number>): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      for (const [projId, pos] of Object.entries(ranks)) {
        await client
          .from('zampa_projects')
          .update({ popular_rank_position: pos })
          .eq('id', projId);
      }

      setZampaProjects(prev => prev.map(p => ranks[p.id] != null ? { ...p, popular_rank_position: ranks[p.id] } : p));
      showToast(`Resultats del veredicte popular consolidats! ✅`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleSaveZampaRating = async (ranks: ZampaUserRank[]): Promise<boolean> => {
    setIsLoaderOpen(true);
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('zampa_user_ranks').upsert(ranks);
      if (error) throw error;

      setZampaUserRanks(prev => {
        const sansUserRank = prev.filter(r => r.user_id !== session?.user.id || r.category !== ranks[0].category);
        return [...sansUserRank, ...ranks];
      });

      showToast(`S'ha desat la teva organització correctament! ✅`);
      return true;
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
      return false;
    } finally {
      setIsLoaderOpen(false);
    }
  };

  const handleGenerateFakeZampaVotes = async (): Promise<void> => {
    setIsLoaderOpen(true);
    setLoaderText('Generant vots ficticis pel consens...');
    try {
      const activeZampaEdition = zampaEditions[0];
      if (!activeZampaEdition) {
        showToast('❌ Error: No hi ha cap edició activa!');
        return;
      }
      
      const currentProjects = zampaProjects.filter(p => p.edition_year === activeZampaEdition.id);
      if (currentProjects.length === 0) {
        showToast('❌ Error: No hi ha projectes creats per a aquesta edició!');
        return;
      }

      const client = getSupabaseClient();
      
      // Pick 10 random other users from our users list, plus the logged in user
      const otherUsers = users.filter(u => u.id !== session?.user.id);
      const shuffledUsers = [...otherUsers].sort(() => 0.5 - Math.random());
      const selectedOthers = shuffledUsers.slice(0, 10);
      const voters = session?.user ? [session.user, ...selectedOthers] : selectedOthers;

      const newRanks: ZampaUserRank[] = [];
      const voterIds: string[] = [];

      for (const voter of voters) {
        voterIds.push(voter.id);
        // Shuffle projects for this user
        const shuffledProjs = [...currentProjects].sort(() => 0.5 - Math.random());
        shuffledProjs.forEach((proj, idx) => {
          newRanks.push({
            user_id: voter.id,
            project_id: proj.id,
            edition_year: activeZampaEdition.id,
            category: 'adult',
            assigned_position: idx + 1
          });
        });
      }

      // Store voter IDs in localStorage so we can delete them clean
      safeStorage.setItem('fem_fictitious_voter_ids', JSON.stringify(voterIds));

      // Batch delete old ranks for these voters for the current edition year first
      if (voterIds.length > 0) {
        await client.from('zampa_user_ranks')
          .delete()
          .in('user_id', voterIds)
          .eq('edition_year', activeZampaEdition.id);
      }

      // Upsert new ranks
      const { error } = await client.from('zampa_user_ranks').insert(newRanks);
      if (error) throw error;

      await loadDatabaseState();
      showToast(`S'han generat vots ficticis per a ${voters.length} membres! 🎲`);
    } catch (err: any) {
      showToast(`❌ Error generant vots: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
      setLoaderText('En procés...');
    }
  };

  const handleDeleteFakeZampaVotes = async (): Promise<void> => {
    setIsLoaderOpen(true);
    setLoaderText('Eliminant vots ficticis...');
    try {
      const activeZampaEdition = zampaEditions[0];
      if (!activeZampaEdition) {
        showToast('❌ Error: No hi ha cap edició activa!');
        return;
      }

      const client = getSupabaseClient();
      const voterIdsStr = safeStorage.getItem('fem_fictitious_voter_ids');
      
      let voterIds: string[] = [];
      if (voterIdsStr) {
        voterIds = JSON.parse(voterIdsStr);
      }

      // Also clean any user ranks matching non-admin test users to be extra safe
      if (voterIds.length > 0) {
        await client.from('zampa_user_ranks')
          .delete()
          .in('user_id', voterIds)
          .eq('edition_year', activeZampaEdition.id);
      } else {
        // Fallback: Delete ALL votes of other participants in the current edition year to clean completely
        const participantIds = users.filter(u => u.id !== session?.user.id).map(u => u.id);
        if (participantIds.length > 0) {
          await client.from('zampa_user_ranks')
            .delete()
            .in('user_id', participantIds)
            .eq('edition_year', activeZampaEdition.id);
        }
      }

      safeStorage.removeItem('fem_fictitious_voter_ids');
      await loadDatabaseState();
      showToast(`Vots ficticis eliminats amb èxit! 🧹`);
    } catch (err: any) {
      showToast(`❌ Error eliminant vots: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
      setLoaderText('En procés...');
    }
  };

  const handleGenerateFakeZampaResults = async (): Promise<void> => {
    setIsLoaderOpen(true);
    setLoaderText('Generant resultats ficticis...');
    try {
      const activeZampaEdition = zampaEditions[0];
      if (!activeZampaEdition) {
        showToast('❌ Error: No hi ha cap edició activa!');
        return;
      }

      const currentProjects = zampaProjects.filter(p => p.edition_year === activeZampaEdition.id);
      if (currentProjects.length === 0) {
        showToast('❌ Error: No hi ha projectes creats per a aquesta edició!');
        return;
      }

      const client = getSupabaseClient();

      // Random winner
      const randomWinner = currentProjects[Math.floor(Math.random() * currentProjects.length)];
      
      // Update winner
      const { error: errWinning } = await client
        .from('zampa_editions')
        .update({ official_winner_adult: randomWinner.id })
        .eq('id', activeZampaEdition.id);
      if (errWinning) throw errWinning;

      // Assign non-duplicate positions 1..N
      const positions = Array.from({ length: currentProjects.length }, (_, i) => i + 1);
      // Shuffle positions count
      const shuffledPositions = [...positions].sort(() => 0.5 - Math.random());

      for (let i = 0; i < currentProjects.length; i++) {
        const { error: errProj } = await client
          .from('zampa_projects')
          .update({ popular_rank_position: shuffledPositions[i] })
          .eq('id', currentProjects[i].id);
        if (errProj) throw errProj;
      }

      await loadDatabaseState();
      showToast(`S'ha designat el guanyador i classificació popular ficticiament! 🏆`);
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
      setLoaderText('En procés...');
    }
  };

  const handleDeleteFakeZampaResults = async (): Promise<void> => {
    setIsLoaderOpen(true);
    setLoaderText('Eliminant resultats ficticis...');
    try {
      const activeZampaEdition = zampaEditions[0];
      if (!activeZampaEdition) {
        showToast('❌ Error: No hi ha cap edició activa!');
        return;
      }

      const currentProjects = zampaProjects.filter(p => p.edition_year === activeZampaEdition.id);
      const client = getSupabaseClient();

      // Clear winner
      const { error: errWinning } = await client
        .from('zampa_editions')
        .update({ official_winner_adult: null })
        .eq('id', activeZampaEdition.id);
      if (errWinning) throw errWinning;

      // Clear popular_rank_position
      for (const proj of currentProjects) {
        await client
          .from('zampa_projects')
          .update({ popular_rank_position: null })
          .eq('id', proj.id);
      }

      await loadDatabaseState();
      showToast(`S'han esborrat tots els resultats de veredictes oficials! 🧹`);
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`);
    } finally {
      setIsLoaderOpen(false);
      setLoaderText('En procés...');
    }
  };

  // --- STATS CALCULATIONS (REPTES) ---
  const activeObj = objectives.find(o => o.status === 'active');
  const subsCurrentObj = activeObj ? photoSubmissions.filter(s => s.objectiveId === activeObj.id) : [];
  const approvalsCount = subsCurrentObj.filter(s => s.published).length;
  const userSub = activeObj ? photoSubmissions.find(s => s.userId === session?.user.id && s.objectiveId === activeObj.id) : null;
  const totalPartners = users.filter(u => u.role !== 'admin');

  // Multi-score evaluator structure for current voters
  const currentVotesForObj = activeObj ? votes.filter(v => v.objectiveId === activeObj.id) : [];
  const currentVotersCount = Array.from(new Set(currentVotesForObj.map(v => v.userId))).length;

  // Render individual monthly project cards
  const activeZampaEdition = zampaEditions[0];

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-brand-accent selection:text-white pb-10">
      
      {/* GLOBAL TOAST BAR */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[3000] bg-brand-surface2 border border-brand-accent px-5 py-3.5 rounded-2xl shadow-2xl hover:scale-105 transition-all animate-bounce max-w-sm">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-brand-text">
            <Sparkles className="text-brand-accent shrink-0 animate-pulse" size={18} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* LOADER OVERLAY */}
      {isLoaderOpen && (
        <div className="fixed inset-0 bg-black/60 z-[4000] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-surface1 border border-brand-brand border-brand-border-high rounded-2xl p-6 flex flex-col items-center gap-3.5">
            <span className="loader" />
            <p className="text-sm font-semibold text-brand-text font-mono tracking-wide">{loaderText}</p>
          </div>
        </div>
      )}

      {/* TOPBAR / MENU */}
      <header className="sticky top-0 z-[100] bg-bg1/80 backdrop-blur-xl border-b border-brand-border-high">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-accent/15 border border-brand-accent/30 p-2 rounded-xl text-brand-accent">
              <Camera size={22} className="animate-pulse" />
            </div>
            <div className="text-left leading-none">
              <h1 className="font-display tracking-widest text-[#e8f0ff] uppercase text-2xl">
                FEM Votacions
              </h1>
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-brand-text-muted">
                {t('logo_subtitle', lang)}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            
            {/* Lang switcher */}
            <div className="flex border border-brand-border rounded-lg p-0.5 bg-bg1/40">
              <button
                onClick={() => setLang('ca')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${lang === 'ca' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-brand-text'}`}
              >
                CAT
              </button>
              <button
                onClick={() => setLang('es')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${lang === 'es' ? 'bg-brand-accent text-white' : 'text-brand-text-muted hover:text-brand-text'}`}
              >
                ESP
              </button>
            </div>

            {/* DB selector */}
            {showDbSelectors && (
              <div className="flex border border-brand-border rounded-lg p-0.5 bg-bg1/40">
                <button
                  onClick={() => handleDbModeSwitch('normal')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer flex items-center gap-1 ${dbMode === 'normal' ? 'bg-indigo-600 text-white' : 'text-brand-text-muted hover:text-brand-text'}`}
                >
                  <Database size={10} /> Normal
                </button>
                <button
                  onClick={() => handleDbModeSwitch('test')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer flex items-center gap-1 ${dbMode === 'test' ? 'bg-indigo-600 text-white' : 'text-brand-text-muted hover:text-brand-text'}`}
                >
                  <Database size={10} /> Test
                </button>
                <button
                  onClick={() => {
                    setCustomDbUrlInput(safeStorage.getItem('femvotacions_custom_url') || '');
                    setCustomDbKeyInput(safeStorage.getItem('femvotacions_custom_key') || '');
                    setShowDbConfigModal(true);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer flex items-center gap-1 ${dbMode === 'custom' ? 'bg-amber-600 text-white' : 'text-brand-text-muted hover:text-[#ffd666]'}`}
                >
                  <Settings size={10} /> {dbMode === 'custom' ? 'Pròpia' : 'Configura'}
                </button>
              </div>
            )}

            {/* Main view switcher button (Hidden - Only Zampa context is needed) */}

            {session && (
              <div className="flex items-center gap-3 bg-surface1/60 border border-brand-brand border-brand-border p-1 pl-4 rounded-xl">
                <div className="text-right">
                  <p className="text-xs font-bold text-brand-text leading-none">{session.user.display_name}</p>
                  <span className="text-[9px] uppercase font-mono tracking-wider text-brand-text-muted">
                    {session.user.role === 'admin' ? 'Administrador 🔧' : session.user.zampa_role === 'editor' ? 'Editor Zampa 📝' : 'Club Partner 👤'}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-400/10 hover:bg-red-500/20 text-red-400 p-2 rounded-lg cursor-pointer transition-all"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-brand-text cursor-pointer hover:text-brand-accent p-1"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* MOBILE DRAWER */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-bg2 border-b border-brand-border p-4 space-y-4">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-brand-text-muted">IDIOMA</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setLang('ca'); setMobileMenuOpen(false); }}
                  className={`flex-1 py-1 text-xs font-bold rounded ${lang === 'ca' ? 'bg-brand-accent text-white' : 'bg-surface2 text-brand-text-muted'}`}
                >
                  CATALÀ
                </button>
                <button
                  onClick={() => { setLang('es'); setMobileMenuOpen(false); }}
                  className={`flex-1 py-1 text-xs font-bold rounded ${lang === 'es' ? 'bg-brand-accent text-white' : 'bg-surface2 text-brand-text-muted'}`}
                >
                  CASTELLANO
                </button>
              </div>

              {showDbSelectors && (
                <>
                  <span className="text-[10px] font-bold text-brand-text-muted">BASE DE DADES</span>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { handleDbModeSwitch('normal'); setMobileMenuOpen(false); }}
                        className={`flex-1 py-1 text-xs font-bold rounded ${dbMode === 'normal' ? 'bg-indigo-600 text-white' : 'bg-surface2 text-brand-text-muted'}`}
                      >
                        NORMAL
                      </button>
                      <button
                        onClick={() => { handleDbModeSwitch('test'); setMobileMenuOpen(false); }}
                        className={`flex-1 py-1 text-xs font-bold rounded ${dbMode === 'test' ? 'bg-indigo-600 text-white' : 'bg-surface2 text-brand-text-muted'}`}
                      >
                        TEST
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setCustomDbUrlInput(safeStorage.getItem('femvotacions_custom_url') || '');
                        setCustomDbKeyInput(safeStorage.getItem('femvotacions_custom_key') || '');
                        setShowDbConfigModal(true);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full py-1 text-xs font-bold rounded flex justify-center items-center gap-1.5 ${dbMode === 'custom' ? 'bg-amber-600 text-white' : 'bg-surface2 text-brand-text-muted'}`}
                    >
                      <Settings size={12} /> {dbMode === 'custom' ? 'BD Pròpia' : 'Configurar BD Pròpia'}
                    </button>
                  </div>
                </>
              )}

              {session && (
                <>
                  <div className="border-t border-brand-border pt-3 flex justify-between items-center">
                    <span className="text-xs text-brand-text-muted">{session.user.display_name}</span>
                    <button
                      onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                      className="text-red-400 text-xs font-bold"
                    >
                      TANCAR SESSIÓ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-1 w-full">
        
        {!session ? (
          /* GUEST / LOGIN GATEWAY SCREEN */
          <div className="max-w-md mx-auto space-y-6 pt-10">
            {dbError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-left space-y-3 shadow-xl">
                <div className="flex gap-2.5 items-start text-red-400">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h4 className="font-bold text-sm">Error de connexió de Base de Dades</h4>
                    <p className="text-xs mt-1 text-brand-text-muted leading-relaxed">
                      {dbError}
                    </p>
                  </div>
                </div>
                <div className="pt-1 flex gap-2">
                  <button
                    onClick={() => {
                      setCustomDbUrlInput(safeStorage.getItem('femvotacions_custom_url') || '');
                      setCustomDbKeyInput(safeStorage.getItem('femvotacions_custom_key') || '');
                      setShowDbConfigModal(true);
                    }}
                    className="flex-1 bg-amber-500/20 border border-amber-500/30 text-amber-200 hover:bg-amber-500 hover:text-[#04091e] px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    🔧 Configurar BD Pròpia / Supabase
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-surface2 border border-brand-border text-brand-text hover:bg-surface3 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Actualitza 🔄
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-center border-b border-brand-border p-1 bg-surface1/40 rounded-xl">
              <button
                onClick={() => setLoginTab('login')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loginTab === 'login'
                    ? 'bg-brand-accent text-white shadow-md'
                    : 'text-brand-text-muted hover:text-brand-text'
                }`}
              >
                {t('login_tab', lang)}
              </button>
              <button
                onClick={() => setLoginTab('register')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  loginTab === 'register'
                    ? 'bg-brand-accent text-white shadow-md'
                    : 'text-brand-text-muted hover:text-brand-text'
                }`}
              >
                {t('register_tab', lang)}
              </button>
            </div>

            {loginTab === 'login' ? (
              <form
                onSubmit={handleLogin}
                className="bg-surface1 border border-brand-border rounded-2xl p-6 space-y-4 text-left shadow-2xl relative"
              >
                <h3 className="font-display tracking-widest text-[#e8f0ff] uppercase text-2xl text-center mb-6">
                  {t('login_title', lang)}
                </h3>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('username_label', lang)}
                  </label>
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('password_label', lang)}
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-brand-accent hover:opacity-90 active:scale-[0.98] text-[#04091e] font-bold py-3 px-4 rounded-xl cursor-pointer shadow-lg shadow-brand-accent-glow font-mono transition-transform"
                >
                  {t('enter_btn', lang)}
                </button>

                {isSuperModeEnabled && (
                  <div className="bg-bg1/60 border border-brand-border/40 rounded-xl p-3 text-[11px] text-brand-text-muted leading-relaxed space-y-1">
                    <span className="font-bold text-xs text-[#b8c5ff] flex items-center gap-1">
                      🔑 Consell d'accés:
                    </span>
                    <p>
                      Com que la base de dades s'ha connectat amb èxit! Pots accedir amb el teu propi usuari administrador:
                    </p>
                    <div className="font-mono text-[10px] bg-black/30 p-2 rounded text-[#ffd666] space-y-1">
                      <div>Usuari: <strong className="text-white">admin@femrank.cat</strong> (o <strong className="text-white">admin</strong>)</div>
                      <div>Contrasenya: <strong className="text-white">admin123</strong></div>
                    </div>
                    <p className="pt-1">
                      O bé pots anar a la pestanya superior <strong>"Registre"</strong> per crear un usuari nou per a qualsevol participant.
                    </p>
                  </div>
                )}
              </form>
            ) : (
              <form
                onSubmit={handleRegister}
                className="bg-surface1 border border-brand-border rounded-2xl p-6 space-y-4 text-left shadow-2xl relative animate-fade-in"
              >
                <h3 className="font-display tracking-widest text-[#e8f0ff] uppercase text-2xl text-center mb-6">
                  REGISTRE SOCIS
                </h3>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('fullname_label', lang)}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullnameInput}
                    onChange={(e) => setFullnameInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('email_label', lang)}
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('password_label', lang)}
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted uppercase font-semibold font-mono tracking-wider">
                    {t('confirm_pass_label', lang)}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                  />
                </div>

                <p className="text-[10px] text-brand-text-muted leading-normal">
                  {t('register_note', lang)}
                </p>

                <button
                  type="submit"
                  className="w-full bg-brand-accent hover:opacity-90 active:scale-[0.98] text-[#04091e] font-bold py-3 px-4 rounded-xl cursor-pointer shadow-lg shadow-brand-accent-glow font-mono"
                >
                  {t('create_account_btn', lang)}
                </button>
              </form>
            )}

            {!dbError && isSuperModeEnabled && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomDbUrlInput(safeStorage.getItem('femvotacions_custom_url') || '');
                    setCustomDbKeyInput(safeStorage.getItem('femvotacions_custom_key') || '');
                    setShowDbConfigModal(true);
                  }}
                  className="text-xs text-brand-text-muted hover:text-brand-accent font-semibold transition-colors flex items-center gap-1.5 mx-auto cursor-pointer bg-transparent border-0 outline-none"
                >
                  <Database size={12} /> Tens la teva pròpia base de dades? Configura-la aquí
                </button>
              </div>
            )}
          </div>
        ) : (
          /* SESSION CONNECTED VIEW */
          <div className="space-y-6">

            {/* A) CONTEXTE "ZAMPA" DIRECT FLOOD */}
            {activeContext === 'zampa' ? (
              <div className="space-y-6">
                
                {/* Switch Admin / Soci is available if Admin */}
                {(session.user.role === 'admin' || session.user.zampa_role === 'admin' || session.user.zampa_role === 'editor') && (
                  <div className="flex border border-brand-border rounded-xl p-1 bg-surface1 max-w-lg mx-auto flex-wrap">
                    <button
                      onClick={() => { setIsAdminMode(false); }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer min-w-[100px] ${!isAdminMode ? 'bg-[#112260] text-yellow-300 shadow' : 'text-brand-text-muted hover:text-brand-text'}`}
                    >
                      Socis View 📁
                    </button>
                    <button
                      onClick={() => { setIsAdminMode(true); setZampaAdminSubTab('zampa'); }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer min-w-[100px] ${isAdminMode && zampaAdminSubTab === 'zampa' ? 'bg-brand-accent text-white shadow' : 'text-brand-text-muted hover:text-brand-text'}`}
                    >
                      {session.user.role === 'admin' || session.user.zampa_role === 'admin' ? 'Configuració Admin 🔧' : 'Configuració Editor 🔧'}
                    </button>
                    {(session.user.role === 'admin' || session.user.zampa_role === 'admin') && (
                      <button
                        onClick={() => { setIsAdminMode(true); setZampaAdminSubTab('socis'); }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer min-w-[155px] ${isAdminMode && zampaAdminSubTab === 'socis' ? 'bg-brand-accent text-white shadow' : 'text-brand-text-muted hover:text-brand-text'}`}
                      >
                        Gestió d'Usuaris 👥
                      </button>
                    )}
                  </div>
                )}

                {isAdminMode ? (
                  <>
                    {(zampaAdminSubTab === 'zampa' || !(session.user.role === 'admin' || session.user.zampa_role === 'admin')) ? (
                      <ZampaAdmin
                        currentEdition={activeZampaEdition || null}
                        projects={zampaProjects}
                        onUpdateEdition={handleUpdateZampaEditionStatus}
                        onInitEdition={handleInitZampaEdition}
                        onSaveProject={handleSaveZampaProject}
                        onDeleteProject={handleDeleteZampaProject}
                        onSavePhoto={handleSaveZampaPhoto}
                        onDeletePhoto={handleDeleteZampaPhoto}
                        onSavePopularRanks={handleSavePopularRanks}
                        onGenerateFakeVotes={handleGenerateFakeZampaVotes}
                        onDeleteFakeVotes={handleDeleteFakeZampaVotes}
                        onGenerateFakeResults={handleGenerateFakeZampaResults}
                        onDeleteFakeResults={handleDeleteFakeZampaResults}
                        lang={lang}
                        users={users}
                        userRanks={zampaUserRanks}
                        currentUser={session?.user}
                      />
                    ) : (
                      /* Zampa Census / user management board */
                      <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-6">
                        <div className="border-b border-brand-border pb-4">
                          <h3 className="font-display tracking-wider text-brand-text text-2xl uppercase">
                            CENS DE SOCIS I MEMBRES ({users.length})
                          </h3>
                          <p className="text-xs text-brand-text-muted">
                            Gestió general de perfils de la FEM. Pots canviar els noms dels socis, assignar-los rols dins d'aquesta bústia o l'edició dels premis Zampa, i restablir o eliminar comptes.
                          </p>
                        </div>

                        <div className="overflow-x-auto border border-brand-border rounded-xl">
                          <table className="w-full text-xs font-mono text-left">
                            <thead className="bg-[#112260] border-b border-brand-border-high text-brand-text-muted font-bold">
                              <tr>
                                <th className="px-4 py-3 font-semibold uppercase">{t('member_name', lang)}</th>
                                <th className="px-4 py-3 font-semibold uppercase">Email / Usuari</th>
                                <th className="px-4 py-3 font-semibold uppercase">Rol Zampa</th>
                                <th className="px-4 py-3 font-semibold uppercase">Contrasenya</th>
                                <th className="px-4 py-3 font-semibold uppercase">Contrasenya Acció</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border bg-bg1/20 text-brand-text">
                              {users.map((mbr) => (
                                <tr key={mbr.id} className="hover:bg-bg1/40">
                                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                                    <input
                                      type="text"
                                      defaultValue={mbr.display_name}
                                      onBlur={(e) => handleUpdateMemberName(mbr.id, e.target.value)}
                                      className="bg-transparent border-0 hover:border focus:border focus:ring-1 focus:ring-brand-accent focus:outline-none border-brand-border-high rounded px-1.5 py-0.5 text-xs text-brand-text text-left max-w-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-3">{mbr.email}</td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={mbr.zampa_role || 'user'}
                                      onChange={(e) => handleUpdateMemberZampaRole(mbr.id, e.target.value)}
                                      className="bg bg-bg1 border border-brand-border text-brand-text rounded px-2 py-1 text-xs focus:outline-none focus:border-brand-accent cursor-pointer"
                                    >
                                      <option value="user">User (Soci)</option>
                                      <option value="editor">Editor (Zampa)</option>
                                      <option value="admin">Admin (Zampa)</option>
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 select-all">{mbr.password || '••••'}</td>
                                  <td className="px-4 py-3 flex gap-2">
                                    <button
                                      onClick={() => handleResetMemberPwd(mbr)}
                                      className="bg-[#1a2f78] hover:bg-surface3 border border-brand-border text-brand-accent-glow font-bold px-2 py-1 rounded text-[10px] cursor-pointer whitespace-nowrap"
                                    >
                                      Reset (1234)
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMember(mbr)}
                                      className="bg-red-950/20 text-red-400 hover:text-red-300 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                                    >
                                      Eliminar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!activeZampaEdition ? (
                      <div className="max-w-md mx-auto text-center bg-surface1 border border-brand-border rounded-2xl p-8 space-y-4">
                        <Camera size={44} className="text-brand-text-muted shrink-0 mx-auto opacity-30" />
                        <h3 className="text-xl font-bold text-brand-text uppercase">Preparant l'exposició</h3>
                        <p className="text-xs text-brand-text-muted">La junta està posant a punt les sales d'exposició per a la gran nit d'aquest any. Properament.</p>
                      </div>
                    ) : (
                      <ZampaParticipant
                        currentEdition={activeZampaEdition}
                        projects={zampaProjects}
                        userRanks={zampaUserRanks}
                        currentUser={session.user}
                        onSaveRating={handleSaveZampaRating}
                        lang={lang}
                        users={users}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              /* B) CONTEXTE "REPTES" MONTHLY CONCURSO */
              <div className="space-y-6">

                {/* Switch Admin / Participant */}
                {session.user.role === 'admin' && (
                  <div className="flex border border-brand-border rounded-xl p-1 bg-surface1 max-w-sm mx-auto">
                    <button
                      onClick={() => setIsAdminMode(false)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${!isAdminMode ? 'bg-[#112260] text-yellow-300 shadow' : 'text-brand-text-muted hover:text-brand-text'}`}
                    >
                      Socis View 📁
                    </button>
                    <button
                      onClick={() => setIsAdminMode(true)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${isAdminMode ? 'bg-brand-accent text-white shadow' : 'text-brand-text-muted hover:text-brand-text'}`}
                    >
                      Configuració Admin 🔧
                    </button>
                  </div>
                )}

                {isAdminMode ? (
                  /* REPTES ADMIN MODULE */
                  <div className="space-y-6">
                    {/* Admin Tabs */}
                    <div className="flex border-b border-brand-border bg-surface1/60 p-1 rounded-xl max-w-xl mx-auto flex-wrap">
                      {['concurs', 'fotos', 'obj', 'socis'].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition-all uppercase cursor-pointer ${
                            activeTab === tab
                              ? 'bg-brand-accent text-[#04091e] shadow-md'
                              : 'text-brand-text-muted hover:text-brand-text'
                          }`}
                        >
                          {tab === 'concurs' && 'PANEL GENERAL'}
                          {tab === 'fotos' && 'FOTOS REBUDES'}
                          {tab === 'obj' && 'TEMÀTIQUES'}
                          {tab === 'socis' && 'AULES / SOCIS'}
                        </button>
                      ))}
                    </div>

                    {/* Admin Tab: Dashboard general control */}
                    {activeTab === 'concurs' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Submissions & approvals status summary config */}
                        <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-4">
                          <h3 className="font-display tracking-wider text-brand-text text-xl border-b border-brand-border pb-2.5">
                            CONTROL D'ACCESSOS DEL CONCURS
                          </h3>

                          <div className="space-y-4">
                            <div className="flex justify-between items-center bg-bg1/40 p-3 rounded-xl border border-brand-border">
                              <div>
                                <h4 className="text-xs font-bold text-brand-text uppercase tracking-wide">Fase de Pujada</h4>
                                <p className="text-[10px] text-brand-text-muted">Si està activada, els socis poden carregar la seva imatge.</p>
                              </div>
                              <button
                                onClick={() => updateSettingsProperty('uploads_enabled', !appSettings.uploads_enabled)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${appSettings.uploads_enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}
                              >
                                {appSettings.uploads_enabled ? 'ACTIVE' : 'BLOCKED'}
                              </button>
                            </div>

                            <div className="flex justify-between items-center bg-bg1/40 p-3 rounded-xl border border-brand-border">
                              <div>
                                <h4 className="text-xs font-bold text-brand-text uppercase tracking-wide">Fase de Votació</h4>
                                <p className="text-[10px] text-brand-text-muted">Permet als socis emetre punts lliurement tipus estrella.</p>
                              </div>
                              <button
                                onClick={() => updateSettingsProperty('voting_enabled', !appSettings.voting_enabled)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${appSettings.voting_enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}
                              >
                                {appSettings.voting_enabled ? 'ACTIVE' : 'BLOCKED'}
                              </button>
                            </div>

                            <div className="flex justify-between items-center bg-bg1/40 p-3 rounded-xl border border-brand-border">
                              <div>
                                <h4 className="text-xs font-bold text-brand-text uppercase tracking-wide">Amagar Rànquing General</h4>
                                <p className="text-[10px] text-brand-text-muted">Amaga completament la classificació general i històrica.</p>
                              </div>
                              <button
                                onClick={() => updateSettingsProperty('rankingHidden', !appSettings.rankingHidden)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${appSettings.rankingHidden ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' : 'bg-brand-border text-brand-text-muted border-brand-border'}`}
                              >
                                {appSettings.rankingHidden ? 'HIDDEN' : 'VISIBLE'}
                              </button>
                            </div>

                            {/* Close voting and reveal buttons */}
                            {activeObj && (
                              <button
                                onClick={handleCloseVotingsAndReveal}
                                className="w-full bg-brand-accent text-[#04091e] font-bold py-3 px-4 rounded-xl cursor-pointer text-xs uppercase font-mono tracking-wider shadow-lg shadow-brand-accent-glow hover:opacity-90 active:scale-[0.98]"
                              >
                                🔒 TANCAR VOTACIONS I REVELAR AUTORS
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Force controls (forçar ocultació de botons) */}
                        <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-4">
                          <h3 className="font-display tracking-wider text-brand-text text-xl border-b border-brand-border pb-2.5">
                            FORÇAR OCULTACIÓ DE BOTONS
                          </h3>

                          <div className="space-y-2 text-xs">
                            <label className="flex items-center gap-3 bg-bg1/20 p-2.5 rounded-lg border border-brand-border cursor-pointer">
                              <input
                                type="checkbox"
                                checked={appSettings.force_hide_upload}
                                onChange={(e) => updateSettingsProperty('force_hide_upload', e.target.checked)}
                                className="w-4 h-4 cursor-pointer text-brand-accent"
                              />
                              <span>Ocultar botó Pujar Foto</span>
                            </label>

                            <label className="flex items-center gap-3 bg-bg1/20 p-2.5 rounded-lg border border-brand-border cursor-pointer">
                              <input
                                type="checkbox"
                                checked={appSettings.force_hide_vote}
                                onChange={(e) => updateSettingsProperty('force_hide_vote', e.target.checked)}
                                className="w-4 h-4 cursor-pointer text-brand-accent"
                              />
                              <span>Ocultar botó Votar</span>
                            </label>

                            <label className="flex items-center gap-3 bg-bg1/20 p-2.5 rounded-lg border border-brand-border cursor-pointer">
                              <input
                                type="checkbox"
                                checked={appSettings.force_hide_resultats}
                                onChange={(e) => updateSettingsProperty('force_hide_resultats', e.target.checked)}
                                className="w-4 h-4 cursor-pointer text-brand-accent"
                              />
                              <span>Ocultar botó Resultat Repte actual</span>
                            </label>

                            <label className="flex items-center gap-3 bg-bg1/20 p-2.5 rounded-lg border border-brand-border cursor-pointer">
                              <input
                                type="checkbox"
                                checked={appSettings.force_hide_classificacio}
                                onChange={(e) => updateSettingsProperty('force_hide_classificacio', e.target.checked)}
                                className="w-4 h-4 cursor-pointer text-brand-accent"
                              />
                              <span>Ocultar botó Classificació General</span>
                            </label>
                          </div>
                        </div>

                        {/* Summary / Stats block */}
                        <div className="md:col-span-2 bg-surface1 border border-brand-border p-6 rounded-2xl text-left grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="p-3 bg-bg1/40 border border-brand-border rounded-xl">
                            <span className="text-[11px] font-bold text-brand-text-muted uppercase font-mono">AUTOR REBUTS</span>
                            <p className="text-2xl font-black text-brand-text font-mono mt-1">{subsCurrentObj.length}</p>
                          </div>
                          
                          <div className="p-3 bg-bg1/40 border border-brand-border rounded-xl">
                            <span className="text-[11px] font-bold text-brand-text-muted uppercase font-mono">APROVATS</span>
                            <p className="text-2xl font-black text-emerald-500 font-mono mt-1">{approvalsCount}</p>
                          </div>

                          <div className="p-3 bg-bg1/40 border border-brand-border rounded-xl">
                            <span className="text-[11px] font-bold text-brand-text-muted uppercase font-mono">SOCIS HA VOTAT</span>
                            <p className="text-2xl font-black text-yellow-300 font-mono mt-1">
                              {currentVotersCount} / {totalPartners.length}
                            </p>
                          </div>

                          <div className="p-3 bg-bg1/40 border border-brand-border rounded-xl">
                            <span className="text-[11px] font-bold text-brand-text-muted uppercase font-mono">TOTAL SOCIS AGILITATS</span>
                            <p className="text-2xl font-black text-brand-text-muted font-mono mt-1">{users.length}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Admin Tab: Fotos validation and approvals */}
                    {activeTab === 'fotos' && (
                      <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-brand-border pb-4">
                          <div>
                            <h3 className="font-display tracking-wider text-brand-text text-2xl">
                              FOTOS EN ESPERA DE PUBLICACIÓ ({subsCurrentObj.length})
                            </h3>
                            <p className="text-xs text-brand-text-muted mt-1">
                              Les fotografies carregades pels socis no són visibles per als votants fins que les publiques aquí.
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handlePublishAllPhotos}
                              disabled={subsCurrentObj.length === 0}
                              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                            >
                              ✓ Publicar Tot
                            </button>
                            <button
                              onClick={handleExportZip}
                              disabled={subsCurrentObj.length === 0}
                              className="bg-brand-border hover:bg-surface3 text-brand-text border border-brand-border-high text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                            >
                              ⬇ Download ZIP
                            </button>
                          </div>
                        </div>

                        {subsCurrentObj.length === 0 ? (
                          <p className="text-xs text-brand-text-muted py-10 text-center italic uppercase font-mono">
                            No s'han rebut fotos per al concurs actiu.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {subsCurrentObj.map((sub, idx) => {
                              const partner = users.find(u => u.id === sub.userId);
                              return (
                                <div key={sub.id} className="bg-bg1/30 p-4 border border-brand-border rounded-xl space-y-3 relative group">
                                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-brand-border bg-black cursor-zoom-in relative">
                                    <img
                                      src={sub.url}
                                      alt={`Photo ${idx}`}
                                      className="w-full h-full object-cover"
                                      onClick={() => {
                                        // Lightbox trigger
                                        setLightboxList(subsCurrentObj.map(s => ({ url: s.url, fileName: s.fileName })));
                                        setLightboxStartIdx(idx);
                                        setLightboxUrl(sub.url);
                                        setLightboxOpen(true);
                                      }}
                                    />
                                    {sub.published && (
                                      <span className="absolute top-2 left-2 bg-emerald-500 text-[#04091e] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-400">
                                        ✓ Publicat
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs space-y-1">
                                    <div className="flex justify-between items-center text-brand-text truncate">
                                      <span className="font-bold">{partner ? partner.display_name : 'Unknown'}</span>
                                      <span className="text-[10px] text-brand-text-muted font-mono">{sub.fileName}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                      <span className="text-[11px] text-gray-400">Identificador: {sub.id.substring(4, 9)}</span>
                                      <button
                                        onClick={() => handleDeleteMainSubmission(sub.id)}
                                        className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                                        title="Eliminar Foto"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin Tab: Objectives management */}
                    {activeTab === 'obj' && (
                      <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-6">
                        <div className="flex justify-between items-center border-b border-brand-border pb-4">
                          <h3 className="font-display tracking-wider text-brand-text text-2xl">
                            HISTÒRALS DE TEMÀTIQUES ({objectives.length})
                          </h3>
                          <button
                            onClick={() => {
                              setEditingObjective(null);
                              setObjTitle('');
                              setObjDesc('');
                              setShowAddObjectiveModal(true);
                            }}
                            className="bg-brand-accent text-[#04091e] font-bold text-xs px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1 shadow"
                          >
                            <PlusCircle size={14} /> Nova Temàtica
                          </button>
                        </div>

                        {objectives.length === 0 ? (
                          <p className="text-xs text-brand-text-muted py-10 text-center italic">No hi ha cap temàtica creada encara.</p>
                        ) : (
                          <div className="space-y-4">
                            {objectives.map((obj) => (
                              <div key={obj.id} className="bg-bg1/20 border border-brand-border rounded-xl p-4 flex flex-col sm:flex-row justify-between gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-base font-bold text-brand-text">{obj.title}</h4>
                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                      obj.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                      obj.status === 'finished' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' :
                                      'bg-brand-border text-brand-text-muted border border-brand-border'
                                    }`}>
                                      {obj.status === 'active' ? t('active_badge', lang) : t('finished_badge', lang)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-brand-text-muted max-w-2xl">{obj.description}</p>
                                </div>

                                <div className="flex gap-2 items-center self-end sm:self-auto">
                                  {obj.status === 'active' && (
                                    <button
                                      onClick={() => handleFinalizeObjective(obj.id)}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                                    >
                                      🔒 Finalitzar repte
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setEditingObjective(obj);
                                      setObjTitle(obj.title);
                                      setObjDesc(obj.description);
                                      setShowAddObjectiveModal(true);
                                    }}
                                    className="p-1 text-brand-text-muted hover:text-brand-text"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteObjective(obj.id)}
                                    className="p-1 text-brand-text-muted hover:text-red-400"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Admin Tab: Members management */}
                    {activeTab === 'socis' && (
                      <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-6">
                        <div className="border-b border-brand-border pb-4">
                          <h3 className="font-display tracking-wider text-brand-text text-2xl">
                            CENS DE SOCIS REGISTRATS ({users.length})
                          </h3>
                        </div>

                        <div className="overflow-x-auto border border-brand-border rounded-xl">
                          <table className="w-full text-xs font-mono text-left">
                            <thead className="bg-[#112260] border-b border-brand-border-high text-brand-text-muted font-bold">
                              <tr>
                                <th className="px-4 py-3 font-semibold uppercase">{t('member_name', lang)}</th>
                                <th className="px-4 py-3 font-semibold uppercase">Email / Usuari</th>
                                <th className="px-4 py-3 font-semibold uppercase">Rol Zampa</th>
                                <th className="px-4 py-3 font-semibold uppercase">Contrasenya</th>
                                <th className="px-4 py-3 font-semibold uppercase">Contrasenya Acció</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border bg-bg1/20 text-brand-text">
                              {users.map((mbr) => (
                                <tr key={mbr.id} className="hover:bg-bg1/40">
                                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                                    <input
                                      type="text"
                                      defaultValue={mbr.display_name}
                                      onBlur={(e) => handleUpdateMemberName(mbr.id, e.target.value)}
                                      className="bg-transparent border-0 hover:border focus:border focus:ring-1 focus:ring-brand-accent focus:outline-none border-brand-border-high rounded px-1.5 py-0.5 text-xs text-brand-text text-left max-w-sm"
                                    />
                                  </td>
                                  <td className="px-4 py-3">{mbr.email}</td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={mbr.zampa_role || 'user'}
                                      onChange={(e) => handleUpdateMemberZampaRole(mbr.id, e.target.value)}
                                      className="bg bg-bg1 border border-brand-border text-brand-text rounded px-2 py-1 text-xs focus:outline-none focus:border-brand-accent cursor-pointer"
                                    >
                                      <option value="user">User (Soci)</option>
                                      <option value="editor">Editor (Zampa)</option>
                                      <option value="admin">Admin (Zampa)</option>
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 select-all">{mbr.password || '••••'}</td>
                                  <td className="px-4 py-3 flex gap-2">
                                    <button
                                      onClick={() => handleResetMemberPwd(mbr)}
                                      className="bg-[#1a2f78] hover:bg-surface3 border border-brand-border text-brand-accent-glow font-bold px-2 py-1 rounded text-[10px] cursor-pointer"
                                    >
                                      Reset (1234)
                                    </button>
                                    <button
                                      onClick={() => handleDeleteMember(mbr)}
                                      className="bg-red-950/20 text-red-400 hover:text-red-300 px-2 py-0.5 rounded text-[10px] font-bold"
                                    >
                                      Eliminar
                                    </button>
                                  </td>
								</tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* REPTES PARTICIPANT MODULE */
                  <div className="space-y-6">

                    {/* Participant Tabs Navigation */}
                    <div className="flex border-b border-brand-border bg-surface1/60 p-1 rounded-xl max-w-lg mx-auto flex-wrap">
                      {['inici', 'votar', 'resultats'].map((tab) => {
                        const isHidden = 
                          (tab === 'votar' && appSettings.force_hide_vote) ||
                          (tab === 'resultats' && appSettings.force_hide_resultats);
                        
                        if (isHidden) return null;

                        return (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all uppercase cursor-pointer ${
                              activeTab === tab
                                ? 'bg-brand-accent text-[#04091e] shadow-md'
                                : 'text-brand-text-muted hover:text-brand-text'
                            }`}
                          >
                            {tab === 'inici' && 'INICI'}
                            {tab === 'votar' && 'VOTAR'}
                            {tab === 'resultats' && 'CLASSIFICACIÓ'}
                          </button>
                        );
                      })}
                    </div>

                    {/* Tab: INICI */}
                    {activeTab === 'inici' && (
                      <div className="max-w-2xl mx-auto space-y-6">
                        {/* Monthly Theme Header */}
                        {activeObj ? (
                          <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-3 relative group overflow-hidden">
                            <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-brand-accent bg-bg1 border border-brand-border px-2.5 py-1 rounded">
                              TEMÀTIQUES ACTIVES
                            </span>
                            <h2 className="text-3xl font-display tracking-wider text-brand-text">{activeObj.title}</h2>
                            <p className="text-xs text-brand-text-muted leading-relaxed">{activeObj.description}</p>
                          </div>
                        ) : (
                          <div className="bg-surface1 border border-brand-border rounded-2xl p-8 text-center text-brand-text-muted space-y-2">
                            <Trophy className="mx-auto text-brand-text-muted opacity-30" size={44} />
                            <h3 className="font-display text-xl tracking-wider uppercase text-brand-text">Cap repte actiu</h3>
                            <p className="text-xs max-w-sm mx-auto">En aquests moments no hi ha cap repte fotogràfic actiu preparat per la junta deliberant.</p>
                          </div>
                        )}

                        {/* File Upload Zone */}
                        {activeObj && appSettings.uploads_enabled && !appSettings.force_hide_upload && (
                          <div className="bg-surface1 border border-brand-border rounded-2xl p-6 text-left space-y-4">
                            <h3 className="text-lg font-bold text-brand-text uppercase font-mono tracking-wide">
                              {t('my_photo', lang)}
                            </h3>

                            {userSub ? (
                              <div className="space-y-4">
                                <div className="aspect-[4/3] rounded-xl overflow-hidden border border-brand-border bg-black relative max-w-md">
                                  <img src={userSub.url} alt="My uploaded photo" className="w-full h-full object-cover" />
                                  <span className={`absolute top-2 left-2 px-3 py-1 rounded-full text-[10px] font-bold border ${
                                    userSub.published
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'
                                  }`}>
                                    {userSub.published ? t('photo_published', lang) : t('photo_pending', lang)}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteMainSubmission(userSub.id)}
                                  className="text-red-400 hover:text-red-300 text-xs font-semibold uppercase flex items-center gap-1.5 cursor-pointer bg-red-950/20 border border-red-500/10 px-4 py-2 rounded-lg"
                                >
                                  <Trash2 size={12} /> {t('delete_photo_btn', lang)}
                                </button>
                              </div>
                            ) : (
                              <div className="border border-dashed border-brand-border hover:border-brand-accent rounded-xl p-6 text-center cursor-pointer relative bg-bg1/10 flex flex-col items-center">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleUploadMainPhoto}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                  disabled={uploadProgress}
                                />
                                {uploadProgress ? (
                                  <div className="space-y-2">
                                    <span className="loader" />
                                    <p className="text-xs text-brand-text-muted">Comprimint i eliminant EXIF...</p>
                                  </div>
                                ) : (
                                  <>
                                    <Upload className="text-brand-text-muted size-7 mb-2" />
                                    <span className="text-xs font-bold text-brand-text-muted">{t('upload_zone_title', lang)}</span>
                                    <span className="text-[10px] text-brand-text-muted block mt-1">{t('upload_zone_subtitle', lang)}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: VOTAR (REPTES) */}
                    {activeTab === 'votar' && activeObj && (
                      <div className="space-y-6">
                        
                        {!appSettings.voting_enabled ? (
                          <div className="max-w-md mx-auto text-center bg-surface1 border border-brand-border rounded-xl p-8 space-y-4">
                            <Lock className="text-yellow-400 mx-auto animate-pulse" size={48} />
                            <h3 className="font-display text-xl uppercase text-brand-text">ELS VOTS NO ESTAN OBERTS ENCARA</h3>
                            <p className="text-xs text-brand-text-muted leading-relaxed">Paciència! La fase de puntuació s'iniciarà properament. Podràs votar la teva opinió un cop es publiquin i aprovin totes les fotografies dels participants.</p>
                          </div>
                        ) : (
                          <div className="space-y-6 max-w-5xl mx-auto">
                            <div className="text-left border-b border-brand-border pb-3">
                              <h3 className="font-display tracking-wider text-brand-text text-2xl uppercase">EMISSIÓ DE PUNTS TEMAL</h3>
                              <p className="text-xs text-brand-text-muted">Puntua de 1 a 10 cada aspecte fotogràfic d'acord al teu judici (creativitat, temàtica, composició):</p>
                            </div>

                            {photoSubmissions.filter(s => s.objectiveId === activeObj.id && s.published).length === 0 ? (
                              <p className="text-xs text-brand-text-muted italic py-10">No hi ha fotos aprovades en exposició en aquests moments.</p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {photoSubmissions
                                  .filter(s => s.objectiveId === activeObj.id && s.published)
                                  .map((sub, sIdx) => {
                                    const isOwn = sub.userId === session.user.id;
                                    const score = votesInput[sub.id] || { creativity: 5, theme: 5, composition: 5 };

                                    const changeScore = (field: 'creativity' | 'theme' | 'composition', val: number) => {
                                      setVotesInput(prev => ({
                                        ...prev,
                                        [sub.id]: {
                                          ...(prev[sub.id] || { creativity: 5, theme: 5, composition: 5 }),
                                          [field]: val,
                                        }
                                      }));
                                    };

                                    return (
                                      <div key={sub.id} className="bg-surface1 border border-brand-border rounded-2xl p-5 hover:border-brand-border-high transition-all flex flex-col sm:flex-row gap-5">
                                        
                                        {/* Image wrapper */}
                                        <div
                                          className="aspect-[4/3] rounded-xl overflow-hidden border border-brand-border bg-black cursor-zoom-in relative sm:w-2/5 shrink-0"
                                          onClick={() => {
                                            setLightboxList([{ url: sub.url, fileName: sub.fileName }]);
                                            setLightboxStartIdx(0);
                                            setLightboxUrl(sub.url);
                                            setLightboxOpen(true);
                                          }}
                                        >
                                          <img src={sub.url} alt="Challenge file" className="w-full h-full object-cover" />
                                          {isOwn && (
                                            <span className="absolute bottom-2 left-2 bg-brand-accent text-[#04091e] border border-brand-accent px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider font-mono">
                                              LA TEVA FOTO
                                            </span>
                                          )}
                                        </div>

                                        {/* Evaluation block */}
                                        <div className="flex-1 text-left space-y-3">
                                          <div className="border-b border-brand-border pb-1.5 flex justify-between items-center bg-bg1/25 p-2 rounded">
                                            <span className="text-xs font-mono font-bold text-brand-text-muted">FOTO REF: #{sub.id.substring(4, 9)}</span>
                                            {appSettings.namesRevealed && (
                                              <span className="text-[10px] font-bold text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded">
                                                {users.find(u => u.id === sub.userId)?.display_name || 'Generic'}
                                              </span>
                                            )}
                                          </div>

                                          {isOwn ? (
                                            <div className="h-28 flex items-center justify-center border border-dashed border-brand-border rounded-xl">
                                              <p className="text-[10px] text-brand-text-muted italic">⭐ No pots votar la teva pròpia imatge d'acord amb la normativa.</p>
                                            </div>
                                          ) : (
                                            <div className="space-y-2">
                                              {/* Star row: Creativity */}
                                              <div className="space-y-0.5">
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                                                  <span>Creativitat</span>
                                                  <span className="font-mono text-brand-accent font-bold">{score.creativity} / 10</span>
                                                </div>
                                                <input
                                                  type="range"
                                                  min={1}
                                                  max={10}
                                                  value={score.creativity}
                                                  onChange={(e) => changeScore('creativity', parseInt(e.target.value))}
                                                  className="w-full text-brand-accent cursor-pointer"
                                                />
                                              </div>

                                              {/* Star row: Theme */}
                                              <div className="space-y-0.5">
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                                                  <span>Temàtica</span>
                                                  <span className="font-mono text-brand-accent font-bold">{score.theme} / 10</span>
                                                </div>
                                                <input
                                                  type="range"
                                                  min={1}
                                                  max={10}
                                                  value={score.theme}
                                                  onChange={(e) => changeScore('theme', parseInt(e.target.value))}
                                                  className="w-full text-brand-accent cursor-pointer"
                                                />
                                              </div>

                                              {/* Star row: Composition */}
                                              <div className="space-y-0.5">
                                                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-brand-text-muted">
                                                  <span>Composició</span>
                                                  <span className="font-mono text-brand-accent font-bold">{score.composition} / 10</span>
                                                </div>
                                                <input
                                                  type="range"
                                                  min={1}
                                                  max={10}
                                                  value={score.composition}
                                                  onChange={(e) => changeScore('composition', parseInt(e.target.value))}
                                                  className="w-full text-brand-accent cursor-pointer"
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}

                            {/* Guardar vots footer */}
                            {photoSubmissions.filter(s => s.objectiveId === activeObj.id && s.published).length > 0 && (
                              <div className="pt-4 flex justify-center">
                                <button
                                  onClick={saveVotes}
                                  className="bg-brand-accent hover:opacity-90 font-bold px-10 py-3.5 rounded-xl cursor-pointer text-[#04091e] uppercase tracking-wider text-xs shadow-lg shadow-brand-accent-glow"
                                >
                                  Desar les Puntuacions Generals
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab: CLASSFICACIO / NETLIFY IFRAME COUPLING */}
                    {activeTab === 'resultats' && (
                      <div className="bg-surface1 border border-brand-border rounded-2xl p-4 md:p-6 text-center space-y-6">
                        <div className="border-b border-brand-border pb-3 text-left">
                          <h3 className="font-display tracking-wider text-brand-text text-2xl uppercase">NETLIFY REPTES CLASS</h3>
                          <p className="text-xs text-brand-text-muted">Iframe amb el portal de càlcul d'afinitats fotogràfiques i rànquings acumulats:</p>
                        </div>
                        
                        <div className="relative w-full aspect-[16/9] border border-brand-border rounded-xl overflow-hidden bg-bg1">
                          <iframe
                            src="https://femreptesranking.netlify.app"
                            title="L'Iframe de Reptes"
                            className="w-full h-full border-none"
                            id="netlify-frame"
                          />
                        </div>
                      </div>
                    )}

                  </div>
                )}

              </div>
            )}

            {/* C) MODAL DIALOGS AND FORMS COMPILER */}

            {/* ADD / EDIT MONTHLY THEME DIALOG */}
            {showAddObjectiveModal && (
              <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm">
                <form
                  onSubmit={handleSaveObjective}
                  className="bg-surface1 border border-brand-border rounded-2xl p-6 max-w-md w-full space-y-4"
                >
                  <h3 className="font-display text-2xl tracking-widest text-[#e8f0ff] uppercase">
                    {editingObjective ? 'Editar Temàtica' : 'Nova Temàtica'}
                  </h3>

                  <div className="space-y-1 text-left">
                    <label className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">
                      Títol del repte
                    </label>
                    <input
                      type="text"
                      required
                      value={objTitle}
                      onChange={(e) => setObjTitle(e.target.value)}
                      className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-xs text-brand-text-muted block font-semibold uppercase tracking-wider">
                      Descripció o Línies artístiques
                    </label>
                    <textarea
                      value={objDesc}
                      onChange={(e) => setObjDesc(e.target.value)}
                      rows={4}
                      className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      className="flex-1 bg-surface2 hover:bg-surface3 text-brand-text font-semibold px-4 py-2.5 rounded-xl cursor-pointer border border-brand-border text-sm"
                      onClick={() => setShowAddObjectiveModal(false)}
                    >
                      {t('cancel_btn', lang)}
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-brand-accent hover:opacity-90 text-[#04091e] font-semibold px-4 py-2.5 rounded-xl cursor-pointer text-sm shadow-md"
                    >
                      {t('save_btn', lang)}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* FORCE RESET PASSWORD FORCE NEW */}
            {showNewPwdModal && (
              <div className="fixed inset-0 bg-black/80 z-[1600] flex items-center justify-center p-4 backdrop-blur-md">
                <form
                  onSubmit={handleSaveNewPassword}
                  className="bg-surface1 border border-brand-border rounded-2xl p-6 max-w-sm w-full space-y-4"
                >
                  <h3 className="font-display text-2xl tracking-widest text-brand-text uppercase">
                    {t('new_pwd_modal_title', lang)}
                  </h3>
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    {t('new_pwd_modal_msg', lang)}
                  </p>

                  <div className="space-y-1 text-left">
                    <label className="text-xs text-brand-text-muted block font-semibold uppercase">
                      {t('new_pwd_label', lang)}
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-xs text-brand-text-muted block font-semibold uppercase">
                      {t('new_pwd_repeat', lang)}
                    </label>
                    <input
                      type="password"
                      required
                      value={newPasswordRepeat}
                      onChange={(e) => setNewPasswordRepeat(e.target.value)}
                      className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2 rounded-lg text-sm focus:outline-none focus:border-brand-accent"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-brand-accent hover:opacity-90 text-white font-semibold py-2.5 rounded-xl cursor-pointer text-sm shadow-md"
                  >
                    {t('new_pwd_save', lang)}
                  </button>
                </form>
              </div>
            )}

          </div>
        )}

        {/* DB CONFIGURATION MODAL */}
        {showDbConfigModal && (
          <div className="fixed inset-0 bg-black/85 z-[4100] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-surface1 border border-brand-border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl text-left">
              <div className="flex justify-between items-center pb-2 border-b border-brand-border">
                <h3 className="font-display text-lg tracking-widest text-[#e8f0ff] uppercase flex items-center gap-2">
                  <Database className="text-brand-accent animate-pulse" size={20} />
                  Configurar Base de Dades Pròpia
                </h3>
                <button
                  onClick={() => setShowDbConfigModal(false)}
                  className="text-brand-text-muted hover:text-[#e8f0ff] cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-brand-text-muted leading-relaxed">
                Pots connectar aquesta aplicació directament al teu propi projecte de <strong>Supabase</strong>. 
              </p>

              <div className="bg-[#0b122e] border border-indigo-505/10 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed space-y-1.5">
                <span className="font-bold flex items-center gap-1 text-brand-accent uppercase tracking-wider text-[10px]">
                  Instruccions:
                </span>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Crea un projecte buit a <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline font-bold text-white hover:text-brand-accent">supabase.com</a>.</li>
                  <li>Vés al <strong>SQL Editor</strong> del teu projecte Supabase, copia el contingut del fitxer <strong>schema_complet.sql</strong> i executa'l.</li>
                  <li>Copia la teva <strong>Project URL</strong> i la teva <strong>anon/public Key</strong> (Settings &gt; API) i enganxa-les sota.</li>
                </ol>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!customDbUrlInput.trim() || !customDbKeyInput.trim()) {
                  showToast('❌ URL i Clau són obligatòries');
                  return;
                }
                setCustomConfig(customDbUrlInput, customDbKeyInput);
                setDbMode('custom');
                setShowDbConfigModal(false);
                showToast('✅ Base de dades personalitzada configurada amb èxit! Reconnectant... 🔄');
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-brand-text-muted block uppercase font-bold tracking-wider">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://vostre-projecte.supabase.co"
                    value={customDbUrlInput}
                    onChange={(e) => setCustomDbUrlInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-brand-text px-4 py-2.5 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#b8c5ff] block uppercase font-bold tracking-wider">
                    Supabase Anon / Public Key
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="eyJhbGciOiJIUzI1Ni..."
                    value={customDbKeyInput}
                    onChange={(e) => setCustomDbKeyInput(e.target.value)}
                    className="w-full bg-bg1 border border-brand-border text-gray-200 px-4 py-2 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2 text-xs font-bold uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => {
                      clearCustomConfig();
                      setDbMode('normal');
                      setShowDbConfigModal(false);
                      showToast('🔄 Restablits els valors de la base de dades general');
                      setTimeout(() => {
                        window.location.reload();
                      }, 500);
                    }}
                    className="flex-1 bg-red-950/40 border border-red-500/20 hover:bg-red-900/40 text-red-400 py-2.5 rounded-xl transition-all cursor-pointer text-center"
                  >
                    Netejar / Original
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-brand-accent hover:opacity-90 text-[#04091e] py-2.5 rounded-xl transition-all cursor-pointer text-center"
                  >
                    Desar i Connectar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* LIGHTBOX MODAL DE PLANTA COMPLETA CAROUSEL (REPTES) */}
      {lightboxOpen && (
        <FullscreenViewer
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          url={lightboxUrl}
          photosList={lightboxList}
          startIndex={lightboxStartIdx}
          showDownload
        />
      )}

      {/* BOTTOM FOOTER */}
      <footer className="w-full py-4 border-t border-brand-border text-center text-[10px] text-brand-text-muted select-none mt-auto">
        <p>© {new Date().getFullYear()} FEM Votacions · Desenvolupat amb l'esperit artístic d'un club de fotografia excel·lent.</p>
      </footer>
    </div>
  );
}
