import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const DB_NAME = "mushroom-poi-db";
const DB_VERSION = 1;
const STORE = "spots";
const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const elements = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  form: document.querySelector("#spotForm"),
  locateButton: document.querySelector("#locateButton"),
  positionStatus: document.querySelector("#positionStatus"),
  titleInput: document.querySelector("#titleInput"),
  categoryInput: document.querySelector("#categoryInput"),
  latInput: document.querySelector("#latInput"),
  lngInput: document.querySelector("#lngInput"),
  communeInput: document.querySelector("#communeInput"),
  dateInput: document.querySelector("#dateInput"),
  photoInput: document.querySelector("#photoInput"),
  photoPreview: document.querySelector("#photoPreview"),
  recordButton: document.querySelector("#recordButton"),
  voiceStatus: document.querySelector("#voiceStatus"),
  audioPreview: document.querySelector("#audioPreview"),
  commentInput: document.querySelector("#commentInput"),
  resetButton: document.querySelector("#resetButton"),
  spotList: document.querySelector("#spotList"),
  spotCount: document.querySelector("#spotCount"),
  emptyState: document.querySelector("#emptyState"),
  template: document.querySelector("#spotTemplate"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  authStatus: document.querySelector("#authStatus"),
  authForm: document.querySelector("#authForm"),
  emailInput: document.querySelector("#emailInput"),
  passwordInput: document.querySelector("#passwordInput"),
  signInButton: document.querySelector("#signInButton"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  syncButton: document.querySelector("#syncButton"),
  signedInPanel: document.querySelector("#signedInPanel"),
  userEmail: document.querySelector("#userEmail"),
  installButton: document.querySelector("#installButton")
};

let db;
let spots = [];
let photoBlob = null;
let audioBlob = null;
let recorder = null;
let recordedChunks = [];
let deferredInstallPrompt = null;
let supabase = null;
let currentUser = null;

const categoryLabels = {
  cepe: "Cèpe",
  girolle: "Girolle",
  morille: "Morille",
  autre: "Autre"
};

init();

async function init() {
  db = await openDb();
  setDefaultDate();
  await loadSpots();
  bindEvents();
  await initAuth();
  registerServiceWorker();
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  elements.locateButton.addEventListener("click", capturePosition);
  elements.photoInput.addEventListener("change", handlePhoto);
  elements.recordButton.addEventListener("click", toggleRecording);
  elements.resetButton.addEventListener("click", resetForm);
  elements.form.addEventListener("submit", saveSpot);
  elements.searchInput.addEventListener("input", renderSpots);
  elements.categoryFilter.addEventListener("change", renderSpots);
  elements.exportButton.addEventListener("click", exportSpots);
  elements.importInput.addEventListener("change", importSpots);
  elements.signInButton.addEventListener("click", signIn);
  elements.signUpButton.addEventListener("click", signUp);
  elements.signOutButton.addEventListener("click", signOut);
  elements.syncButton.addEventListener("click", syncCloud);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });
}

async function initAuth() {
  if (!isSupabaseConfigured()) {
    setAuthStatus("Mode local actif, Supabase non configuré");
    setSignedInUi(null);
    return;
  }

  try {
    const { createClient } = await import(SUPABASE_JS_URL);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    currentUser = data.user;
    setSignedInUi(currentUser);
    setAuthStatus(currentUser ? "Connecté" : "Prêt à se connecter");

    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      setSignedInUi(currentUser);
      setAuthStatus(currentUser ? "Connecté" : "Déconnecté");
      if (currentUser) syncCloud();
    });

    if (currentUser) await syncCloud();
  } catch {
    setAuthStatus("Connexion Supabase indisponible");
    setSignedInUi(null);
  }
}

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
}

async function signIn() {
  if (!supabase) {
    setAuthStatus("Renseigne d'abord supabase-config.js");
    return;
  }

  const credentials = getCredentials();
  if (!credentials) return;

  setAuthStatus("Connexion en cours...");
  const { error } = await supabase.auth.signInWithPassword(credentials);
  setAuthStatus(error ? error.message : "Connecté");
}

async function signUp() {
  if (!supabase) {
    setAuthStatus("Renseigne d'abord supabase-config.js");
    return;
  }

  const credentials = getCredentials();
  if (!credentials) return;

  setAuthStatus("Création du compte...");
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) {
    setAuthStatus(error.message);
    return;
  }

  setAuthStatus(data.session ? "Compte créé et connecté" : "Compte créé, vérifie l'email de confirmation");
}

async function signOut() {
  if (!supabase) return;
  setAuthStatus("Déconnexion...");
  const { error } = await supabase.auth.signOut();
  setAuthStatus(error ? error.message : "Déconnecté");
}

async function syncCloud() {
  if (!supabase || !currentUser) {
    setAuthStatus("Connexion nécessaire pour synchroniser");
    return;
  }

  try {
    setAuthStatus("Synchronisation en cours...");
    await pushPendingSpots();
    await pullCloudSpots();
    await loadSpots();
    setAuthStatus("Synchronisation terminée");
  } catch (error) {
    setAuthStatus(`Synchronisation impossible : ${error.message || "erreur réseau"}`);
  }
}

async function pushPendingSpots() {
  const localSpots = await getAllSpots();
  for (const spot of localSpots) {
    if (spot.syncedAt && spot.userId === currentUser.id) continue;
    const syncedSpot = await uploadSpotToCloud(spot);
    await putSpot(syncedSpot);
  }
}

async function pullCloudSpots() {
  const { data, error } = await supabase
    .from("pois")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const localSpots = await getAllSpots();
  const localById = new Map(localSpots.map((spot) => [spot.id, spot]));

  for (const row of data || []) {
    const existing = localById.get(row.id);
    const cloudUpdatedAt = new Date(row.updated_at || row.created_at).getTime();
    const localSyncedAt = existing?.syncedAt ? new Date(existing.syncedAt).getTime() : 0;
    if (existing && localSyncedAt >= cloudUpdatedAt) continue;

    await putSpot(await cloudRowToSpot(row, existing));
  }
}

async function uploadSpotToCloud(spot) {
  const id = spot.id || crypto.randomUUID();
  const photoPath = spot.photo ? await uploadSpotFile("poi-photos", currentUser.id, id, spot.photo, "photo") : spot.photoPath || null;
  const audioPath = spot.audio ? await uploadSpotFile("poi-audio", currentUser.id, id, spot.audio, "audio") : spot.audioPath || null;

  const row = {
    id,
    user_id: currentUser.id,
    title: spot.title || "Coin sans nom",
    category: spot.category || "autre",
    latitude: spot.latitude,
    longitude: spot.longitude,
    commune: spot.commune || null,
    date: spot.date ? new Date(spot.date).toISOString() : new Date().toISOString(),
    comment: spot.comment || null,
    photo_path: photoPath,
    audio_path: audioPath,
    created_at: spot.createdAt || new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("pois")
    .upsert(row)
    .select()
    .single();

  if (error) throw error;

  return {
    ...spot,
    id,
    userId: currentUser.id,
    photoPath,
    audioPath,
    syncedAt: data.updated_at || new Date().toISOString()
  };
}

async function uploadSpotFile(bucket, userId, spotId, blob, prefix) {
  const extension = extensionFromType(blob.type, prefix);
  const path = `${userId}/${spotId}/${prefix}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    cacheControl: "3600",
    upsert: true,
    contentType: blob.type || "application/octet-stream"
  });

  if (error) throw error;
  return path;
}

async function cloudRowToSpot(row, existing) {
  return {
    ...existing,
    id: row.id,
    userId: row.user_id,
    title: row.title || "Coin sans nom",
    category: row.category || "autre",
    latitude: row.latitude,
    longitude: row.longitude,
    commune: row.commune || "",
    date: toDatetimeLocal(row.date),
    comment: row.comment || "",
    photo: existing?.photo || await downloadSpotFile("poi-photos", row.photo_path),
    audio: existing?.audio || await downloadSpotFile("poi-audio", row.audio_path),
    photoPath: row.photo_path,
    audioPath: row.audio_path,
    createdAt: row.created_at || existing?.createdAt || new Date().toISOString(),
    syncedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

async function downloadSpotFile(bucket, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) return null;
  return data;
}

function getCredentials() {
  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;

  if (!email || !password) {
    setAuthStatus("Email et mot de passe nécessaires");
    return null;
  }

  if (password.length < 6) {
    setAuthStatus("Mot de passe : 6 caractères minimum");
    return null;
  }

  return { email, password };
}

function setAuthStatus(message) {
  elements.authStatus.textContent = message;
}

function setSignedInUi(user) {
  elements.authForm.hidden = Boolean(user);
  elements.signedInPanel.hidden = !user;
  elements.userEmail.textContent = user?.email || "";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode = "readonly") {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllSpots() {
  return new Promise((resolve, reject) => {
    const request = transaction().getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putSpot(spot) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").put(spot);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteSpot(id) {
  return new Promise((resolve, reject) => {
    const request = transaction("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadSpots() {
  spots = (await getAllSpots()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  renderSpots();
}

function switchView(viewId) {
  elements.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  elements.views.forEach((view) => view.classList.toggle("is-active", view.id === viewId));
}

function setDefaultDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  elements.dateInput.value = now.toISOString().slice(0, 16);
}

function capturePosition() {
  if (!navigator.geolocation) {
    elements.positionStatus.textContent = "GPS indisponible sur cet appareil";
    return;
  }

  elements.positionStatus.textContent = "Recherche GPS...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      elements.latInput.value = latitude.toFixed(6);
      elements.lngInput.value = longitude.toFixed(6);
      elements.positionStatus.textContent = `Position capturée, précision ${Math.round(accuracy)} m`;
      fillCommune(latitude, longitude);
    },
    () => {
      elements.positionStatus.textContent = "Impossible de récupérer la position";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

async function handlePhoto() {
  const file = elements.photoInput.files?.[0];
  if (!file) {
    photoBlob = null;
    elements.photoPreview.hidden = true;
    return;
  }

  photoBlob = file;
  elements.photoPreview.src = URL.createObjectURL(file);
  elements.photoPreview.hidden = false;
}

async function toggleRecording() {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    elements.voiceStatus.textContent = "Micro indisponible sur cet appareil";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      audioBlob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
      elements.audioPreview.src = URL.createObjectURL(audioBlob);
      elements.audioPreview.hidden = false;
      elements.voiceStatus.textContent = "Mémo vocal prêt";
      elements.recordButton.classList.remove("is-recording");
      elements.recordButton.innerHTML = `${micIcon()} Enregistrer`;
    };
    recorder.start();
    elements.voiceStatus.textContent = "Enregistrement en cours...";
    elements.recordButton.classList.add("is-recording");
    elements.recordButton.innerHTML = `${stopIcon()} Arrêter`;
  } catch {
    elements.voiceStatus.textContent = "Autorisation micro refusée";
  }
}

async function saveSpot(event) {
  event.preventDefault();

  const latitude = Number(elements.latInput.value);
  const longitude = Number(elements.lngInput.value);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const spot = {
    id: crypto.randomUUID(),
    title: elements.titleInput.value.trim() || "Coin sans nom",
    category: elements.categoryInput.value,
    latitude,
    longitude,
    commune: elements.communeInput.value.trim(),
    date: elements.dateInput.value,
    comment: elements.commentInput.value.trim(),
    photo: photoBlob,
    audio: audioBlob,
    createdAt: new Date().toISOString()
  };

  await putSpot(spot);
  if (currentUser) {
    try {
      await putSpot(await uploadSpotToCloud(spot));
      setAuthStatus("POI sauvegardé et synchronisé");
    } catch {
      setAuthStatus("POI sauvegardé localement, synchronisation en attente");
    }
  }
  await loadSpots();
  resetForm();
  switchView("spotsView");
}

function resetForm() {
  elements.form.reset();
  setDefaultDate();
  photoBlob = null;
  audioBlob = null;
  elements.photoPreview.hidden = true;
  elements.photoPreview.removeAttribute("src");
  elements.audioPreview.hidden = true;
  elements.audioPreview.removeAttribute("src");
  elements.positionStatus.textContent = "Position non capturée";
  elements.voiceStatus.textContent = "Aucun mémo enregistré";
}

function renderSpots() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const selectedCategory = elements.categoryFilter.value;
  const filtered = spots.filter((spot) => {
    const category = spot.category || "autre";
    const text = `${spot.title} ${categoryLabels[category]} ${spot.commune || ""} ${spot.comment} ${formatDate(spot.date)} ${spot.latitude} ${spot.longitude}`.toLowerCase();
    return text.includes(query) && (selectedCategory === "all" || category === selectedCategory);
  });

  elements.spotList.replaceChildren();
  elements.spotCount.textContent = `${spots.length} ${spots.length > 1 ? "points" : "point"}`;
  elements.emptyState.hidden = filtered.length > 0;

  filtered.forEach((spot) => {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    const photo = node.querySelector(".spot-photo");
    const title = node.querySelector("h3");
    const meta = node.querySelector(".spot-meta");
    const category = node.querySelector(".spot-category");
    const comment = node.querySelector(".spot-comment");
    const audio = node.querySelector(".spot-audio");
    const routeLink = node.querySelector(".route-link");
    const mapLink = node.querySelector(".map-link");
    const shareButton = node.querySelector(".share-button");
    const deleteButton = node.querySelector(".delete-button");

    const categoryValue = spot.category || "autre";
    title.textContent = spot.title;
    meta.textContent = `${formatDate(spot.date)} • ${spot.commune ? `${spot.commune} • ` : ""}${spot.latitude.toFixed(6)}, ${spot.longitude.toFixed(6)}`;
    category.textContent = categoryLabels[categoryValue] || categoryLabels.autre;
    comment.textContent = spot.comment || "Aucun commentaire";

    if (spot.photo) {
      photo.src = URL.createObjectURL(spot.photo);
      photo.alt = `Photo de ${spot.title}`;
    } else {
      photo.alt = "";
    }

    if (spot.audio) {
      audio.src = URL.createObjectURL(spot.audio);
      audio.hidden = false;
    }

    const destination = `${spot.latitude},${spot.longitude}`;
    routeLink.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;

    shareButton.addEventListener("click", () => shareSpot(spot));

    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Supprimer "${spot.title}" ?`)) return;
      await deleteCloudSpot(spot);
      await deleteSpot(spot.id);
      await loadSpots();
    });

    elements.spotList.append(node);
  });
}

async function exportSpots() {
  const serializable = await Promise.all(spots.map(serializeSpot));

  const blob = new Blob([JSON.stringify(serializable, null, 2)], { type: "application/json" });
  downloadBlob(blob, `coins-champignons-${new Date().toISOString().slice(0, 10)}.json`);
}

async function importSpots() {
  const file = elements.importInput.files?.[0];
  if (!file) return;

  const parsed = JSON.parse(await file.text());
  const data = Array.isArray(parsed) ? parsed : [parsed];

  for (const rawSpot of data) {
    const spot = {
      ...rawSpot,
      category: rawSpot.category || "autre",
      commune: rawSpot.commune || "",
      photo: rawSpot.photo ? dataUrlToBlob(rawSpot.photo) : null,
      audio: rawSpot.audio ? dataUrlToBlob(rawSpot.audio) : null
    };

    await putSpot(spot);
    if (currentUser) {
      try {
        await putSpot(await uploadSpotToCloud(spot));
      } catch {
        setAuthStatus("Import local terminé, synchronisation partielle");
      }
    }
  }
  elements.importInput.value = "";
  await loadSpots();
}

async function deleteCloudSpot(spot) {
  if (!supabase || !currentUser || spot.userId !== currentUser.id) return;
  const { error } = await supabase.from("pois").delete().eq("id", spot.id);
  if (error) setAuthStatus("Suppression cloud impossible, suppression locale effectuée");
}

async function shareSpot(spot) {
  const exportedSpot = await serializeSpot(spot);
  const fileName = safeFileName(`poi-${spot.title}-${spot.date || spot.createdAt}.json`);
  const json = JSON.stringify([exportedSpot], null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const file = new File([blob], fileName, { type: "application/json" });
  const destination = `${spot.latitude},${spot.longitude}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
  const shareData = {
    title: `POI champignon - ${spot.title}`,
    text: `${spot.title} (${categoryLabels[spot.category || "autre"]})\n${spot.commune ? `${spot.commune}\n` : ""}${formatDate(spot.date)}\n${mapsUrl}`,
    files: [file]
  };

  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return;
  }

  downloadBlob(blob, fileName);
  window.location.href = `mailto:?subject=${encodeURIComponent(`POI champignon - ${spot.title}`)}&body=${encodeURIComponent(`J'ai exporté un POI depuis l'application Coins Champignons.\n\n${spot.title}\nType : ${categoryLabels[spot.category || "autre"]}\nCommune : ${spot.commune || "non renseignée"}\nCarte : ${mapsUrl}\n\nJoins le fichier JSON téléchargé à ce mail pour que le destinataire puisse l'importer.`)}`;
}

async function fillCommune(latitude, longitude) {
  elements.communeInput.placeholder = "Recherche de la commune...";

  try {
    const commune = await reverseGeocodeCommune(latitude, longitude);
    elements.communeInput.value = commune || "";
    elements.communeInput.placeholder = commune ? "Commune" : "Commune introuvable, à saisir";
  } catch {
    elements.communeInput.placeholder = "Commune indisponible, à saisir";
  }
}

async function reverseGeocodeCommune(latitude, longitude) {
  const bigDataUrl = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  bigDataUrl.searchParams.set("latitude", latitude);
  bigDataUrl.searchParams.set("longitude", longitude);
  bigDataUrl.searchParams.set("localityLanguage", "fr");

  const bigDataResponse = await fetch(bigDataUrl);
  if (bigDataResponse.ok) {
    const data = await bigDataResponse.json();
    const commune = data.city || data.locality || data.localityInfo?.administrative?.find((item) => item.adminLevel >= 7)?.name;
    if (commune) return commune;
  }

  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("lat", latitude);
  nominatimUrl.searchParams.set("lon", longitude);
  nominatimUrl.searchParams.set("zoom", "10");
  nominatimUrl.searchParams.set("accept-language", "fr");

  const nominatimResponse = await fetch(nominatimUrl);
  if (!nominatimResponse.ok) return "";
  const data = await nominatimResponse.json();
  const address = data.address || {};
  return address.city || address.town || address.village || address.municipality || address.county || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function serializeSpot(spot) {
  return {
    ...spot,
    photo: spot.photo ? await blobToDataUrl(spot.photo) : null,
    audio: spot.audio ? await blobToDataUrl(spot.audio) : null
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extensionFromType(type, fallback) {
  const known = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "audio/wav": "wav"
  };

  return known[type] || (fallback === "audio" ? "webm" : "bin");
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "application/octet-stream";
  const bytes = atob(body);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    array[index] = bytes.charCodeAt(index);
  }
  return new Blob([array], { type: mime });
}

function formatDate(value) {
  if (!value) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
}

function micIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"></path></svg>';
}

function stopIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10"></rect></svg>';
}
