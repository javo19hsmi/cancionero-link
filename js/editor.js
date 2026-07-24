let allSongs = [];
let currentSong = null;
let globalVer = "0";
let isEditMode = false;
let hasUnsavedChanges = false;
let editorListenersAttached = false; 
let activeChordNode = null; // NUEVO: Guarda el acorde actualmente seleccionado

const MOMENTS_LIST = [
  "Entrada", "Acto Penitencial", "Gloria", "Salmos", "Aclamación al Evangelio",
  "Credo", "Ofertorio", "Santo", "Aclamaciones", "Doxologia Final",
  "Padre Nuestro/Tuyo es el Reino", "Cordero de Dios", "Comunión", "Meditación", "Salida",
  "Virgen María", "Espíritu Santo", "Animación", "Adoración Eucarística",
  "Adviento", "Navidad", "Cuaresma", "Semana Santa", "Pascua y Pentecostés","Santo Rosario",
  "Via Crucis", "Pesebre", "Juveniles", "Acción de Gracia", "Misioneros / Vocacionales",
  "Bautismo", "Matrimonios", "Santos y Devociones", "Misa con Niños", "Exequias", "Varios"
];

function initApp() {
  const sel = document.getElementById('m-key-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Sin tono</option>';
    ["Do","Dom","Do#","Do#m","Re","Rem","Mi","Mim","Fa","Fam","Fa#","Fa#m","Sol","Solm","La","Lam","Si","Sim"].forEach(k => {
      let v = {"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[k.replace('m','')] + (k.includes('m')?'m':'');
      sel.appendChild(new Option(k, v));
    });
  }
  
  db.ref('version').on('value', s => { globalVer = String(s.val() || "0"); });
  db.ref('canciones_borrador').on('value', s => { 
    if (s.exists()) { 
      allSongs = Object.values(s.val()).sort((a,b) => a.title.localeCompare(b.title)); 
      filterSongs(); 
    } 
  });
  
  setupEditorListeners();
}

function filterSongs() {
  const q = document.getElementById('song-search-box').value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const res = document.getElementById('song-results-list'); 
  res.innerHTML = "";
  
  allSongs.filter(s => {
    const t = s.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes(q);
  }).slice(0, 40).forEach(s => {
    const div = document.createElement('div'); 
    div.className = `result-item glass ${currentSong && currentSong.id === s.id ? 'active' : ''}`;
    div.innerText = s.title; 
    div.onclick = () => {
        if (hasUnsavedChanges && !confirm("Tenés cambios sin guardar. ¿Querés salir perdiendo los cambios?")) return;
        loadSong(s);
    }; 
    res.appendChild(div);
  });
}

function loadSong(s) {
  currentSong = JSON.parse(JSON.stringify(s));
  
  document.getElementById('m-title-in').value = s.title || "";
  document.getElementById('m-key-sel').value = s.key || "";
  document.getElementById('m-rhythm-in').value = s.rhythm || "";
  document.getElementById('m-artist-in').value = s.artist || "";
  document.getElementById('m-album-in').value = s.album || "";
  document.getElementById('m-year-in').value = s.year || "";
  document.getElementById('m-copyright-in').value = s.copyright || "";
  document.getElementById('m-biography-in').value = s.biography || "";
  document.getElementById('m-sheet-in').value = s.sheetMusicLink || "";
  document.getElementById('m-audio-in').value = s.link || "";

  renderMomentsChips(s.moments || ["Varios"]);

  const editor = document.getElementById('lyrics-editor');
  editor.innerHTML = Render.toVisual(usToEs(s.lyrics));
  
  isEditMode = false; 
  hasUnsavedChanges = false;
  clearChordSelection();
  
  document.getElementById('mode-text').innerText = "MODO ACORDES";
  if (document.getElementById('pencil-btn')) document.getElementById('pencil-btn').style.color = "#555";
  
  updateAudioPreview();
  filterSongs();
}

function renderMomentsChips(selectedArr) {
  const sel = new Set((Array.isArray(selectedArr) ? selectedArr : []).filter(Boolean));
  if (sel.size === 0) sel.add("Varios");
  const el = document.getElementById("moments-container");
  el.innerHTML = "";
  
  MOMENTS_LIST.forEach(m => {
    const d = document.createElement("div");
    d.className = "chip" + (sel.has(m) ? " on" : "");
    d.textContent = m;
    d.dataset.value = m;
    d.onclick = () => {
      d.classList.toggle("on");
      markUnsavedChanges();
      const cur = getSelectedMoments();
      if (cur.length === 0) d.classList.add("on"); 
    };
    el.appendChild(d);
  });
}

function getSelectedMoments() {
  const selected = [];
  document.querySelectorAll("#moments-container .chip.on").forEach(ch => selected.push(ch.dataset.value));
  return selected.length ? selected : ["Varios"];
}

function markUnsavedChanges() {
    hasUnsavedChanges = true;
}

function applyPermissions(permissionsArray) {
    const permMap = { 'canciones': 'tab-songs', 'anuncios': 'tab-announcements', 'oraciones': 'tab-prayers', 'guiones': 'tab-scripts' };
    document.querySelectorAll('.tab-btn').forEach(btn => btn.style.display = 'none');
    
    let firstTab = null;
    permissionsArray.forEach(perm => {
        if (permMap[perm]) {
            const btn = document.getElementById(permMap[perm]);
            if (btn) {
                btn.style.display = 'block';
                if (!firstTab) firstTab = permMap[perm];
            }
        }
    });

    if (permissionsArray.includes('super_admin')) {
        document.getElementById('global-pub-btn').style.display = 'block';
        document.getElementById('pencil-btn').style.display = 'block';
        document.querySelectorAll('.tab-btn').forEach(btn => btn.style.display = 'block');
    } else {
        document.getElementById('global-pub-btn').style.display = 'none';
        document.getElementById('pencil-btn').style.display = 'none';
    }

    if (firstTab) document.getElementById(firstTab).click();
}

function switchMod(mod) {
  document.querySelectorAll('main').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const targetMain = document.getElementById(`mod-${mod}`);
  if (targetMain) targetMain.style.display = 'grid';
  if(event && event.target) event.target.classList.add('active');
}

function toggleEditMode() {
  if (userRole !== 'super_admin') return;
  isEditMode = !isEditMode;
  const area = document.getElementById('lyrics-editor'); 
  
  if (isEditMode) {
      clearChordSelection();
      area.innerText = Render.toRaw(area);
      document.getElementById('mode-text').innerText = "MODO LETRA (MAESTRO)";
      document.getElementById('pencil-btn').style.color = "#4DB6AC";
  } else {
      area.innerHTML = Render.toVisual(area.innerText);
      document.getElementById('mode-text').innerText = "MODO ACORDES";
      document.getElementById('pencil-btn').style.color = "#555";
  }
  area.focus();
}

// ==========================================
// NUEVO SISTEMA DE SELECCIÓN DE ACORDES
// ==========================================
function clearChordSelection() {
    if (activeChordNode) {
        activeChordNode.classList.remove('active');
        activeChordNode = null;
    }
}

function selectChord(node) {
    clearChordSelection();
    activeChordNode = node;
    activeChordNode.classList.add('active');
}

function setupEditorListeners() {
  if (editorListenersAttached) return; 
  editorListenersAttached = true;
  
  const area = document.getElementById('lyrics-editor');
  
  // Detectar clics con el mouse para seleccionar el acorde naranja
  area.addEventListener('click', (e) => {
      if (isEditMode) return;
      if (e.target.classList.contains('chord-chip')) {
          selectChord(e.target);
      } else {
          clearChordSelection();
      }
  });

  area.addEventListener('beforeinput', (e) => { if (!isEditMode) e.preventDefault(); });

  area.addEventListener('keydown', (e) => {
    if (isEditMode) return; 

    // NAVEGACIÓN Y BORRADO CON ALT
    if (e.altKey) {
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            jumpToChord(-1);
            return;
        }
        if (e.key === "ArrowRight") {
            e.preventDefault();
            jumpToChord(1);
            return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            delMob();
            return;
        }
    }

    // Permitir navegación normal con flechas (sin Alt)
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key) && !e.altKey) {
        clearChordSelection(); // Si movés el cursor manualmente, se deselecciona el acorde
        return;
    }
    
    // Permitir atajos del sistema (Ctrl+C, Ctrl+V)
    if (e.ctrlKey || e.metaKey) return;

    e.preventDefault(); 
    e.stopPropagation(); 
    
    const k = e.key.toLowerCase();
    const rootMap = {"d":"Do","r":"Re","m":"Mi","f":"Fa","s":"Sol","l":"La","i":"Si"};
    
    if (rootMap[k]) { insMob(rootMap[k]); } 
    else if (["#", "b", "-", "7"].includes(k)) { modMob(k); } 
    // Si tocan backspace y hay un acorde naranja seleccionado, lo borra directo
    else if ((e.key === "Backspace" || e.key === "Delete") && activeChordNode) { delMob(); }
  });
}

function toggleAcordes() {
  const col = document.getElementById("acordesCol");
  const btn = document.getElementById("toggleAcordesBtn");
  if (col.style.display === "none") {
    col.style.display = "block";
    btn.innerText = "Ocultar Teclado";
  } else {
    col.style.display = "none";
    btn.innerText = "Mostrar Teclado";
  }
}

function insChordVisual(chordText) {
  const area = document.getElementById('lyrics-editor');
  area.focus();
  const id = 'chord-' + Date.now();
  // Eliminamos el &#8203; invisible que rompía la palabra, y le ponemos ID para seleccionarlo al nacer
  const html = `<span id="${id}" class="chord-chip" contenteditable="false" data-chord="${chordText}"></span>`;
  document.execCommand('insertHTML', false, html);
  markUnsavedChanges();
  if(navigator.vibrate) navigator.vibrate(10); 
  
  // Seleccionamos automáticamente el acorde recién creado para que quede naranja
  setTimeout(() => {
      const newNode = document.getElementById(id);
      if (newNode) selectChord(newNode);
  }, 10);
}

function insMob(chordText) { insChordVisual(chordText); }

function insManual() {
  const v = document.getElementById('manual-chord-in').value.trim();
  if (v) { 
    insChordVisual(v); 
    document.getElementById('manual-chord-in').value = ""; 
  }
}

function jumpToChord(dir) {
    const editor = document.getElementById('lyrics-editor');
    const chords = Array.from(editor.querySelectorAll('.chord-chip'));
    if (chords.length === 0) return;

    let currentIndex = activeChordNode ? chords.indexOf(activeChordNode) : -1;

    if (currentIndex === -1) {
        currentIndex = dir > 0 ? 0 : chords.length - 1;
    } else {
        currentIndex += dir;
        if (currentIndex >= chords.length) currentIndex = 0;
        if (currentIndex < 0) currentIndex = chords.length - 1;
    }

    selectChord(chords[currentIndex]);
}

function modMob(mod) {
    // Ahora modifica directamente el acorde naranja (activeChordNode)
    if (activeChordNode) {
        let chord = activeChordNode.getAttribute('data-chord');
        const m = chord.match(/^((?:Do|Re|Mi|Fa|Sol|La|Si)|(?:[A-G]))([#b]?)(m?)(7?)$/i);
        if (!m) return;
        
        let root = m[1], acc = m[2] || "", minor = m[3] || "", sev = m[4] || "";
        if (mod === "#") acc = (acc === "#") ? "" : "#";
        else if (mod === "b") acc = (acc === "b") ? "" : "b";
        else if (mod === "-") minor = (minor === "m") ? "" : "m";
        else if (mod === "7") sev = (sev === "7") ? "" : "7";
        if (acc === '#') acc = (mod === 'b') ? 'b' : '#';
        if (acc === 'b') acc = (mod === '#') ? '#' : 'b';
        
        const newChord = root + acc + minor + sev;
        activeChordNode.setAttribute('data-chord', newChord);
        markUnsavedChanges();
    }
}

function delMob() {
    if (activeChordNode) {
        const nodeToDelete = activeChordNode;
        // Salta al anterior para no perder la selección
        jumpToChord(-1); 
        if (activeChordNode === nodeToDelete) {
            clearChordSelection();
        }
        nodeToDelete.remove();
        markUnsavedChanges();
    }
}

async function uploadFile(input, folder, targetInputId) {
  const file = input.files[0];
  if (!file || !currentSong) return;

  const status = document.getElementById("uploadStatus");
  const linkInput = document.getElementById(targetInputId);
  
  status.textContent = "⏳ Subiendo archivo a Storage...";
  setBusy(true, "Subiendo archivo...");

  try {
    const fileName = `${currentSong.id}_${Date.now()}_${file.name}`;
    const ref = storage.ref(`canciones/${folder}/${fileName}`);
    await ref.put(file);
    const downloadUrl = await ref.getDownloadURL();
    
    linkInput.value = downloadUrl;
    status.textContent = "✅ Archivo subido con éxito.";
    markUnsavedChanges();
    if(folder === 'audios') updateAudioPreview();
  } catch (error) {
    status.textContent = `❌ Error: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

function updateAudioPreview() {
  const link = document.getElementById("m-audio-in").value.trim();
  const container = document.getElementById("audioPreviewContainer");
  const wrapper = document.getElementById("playerWrapper");

  if (!link) { container.style.display = "none"; wrapper.innerHTML = ""; return; }

  container.style.display = "block";
  if (link.includes("youtube.com") || link.includes("youtu.be")) {
    let videoId = link.includes("v=") ? link.split("v=")[1].split("&")[0] : link.split("/").pop().split("?")[0];
    wrapper.innerHTML = `<iframe width="100%" height="80" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="border-radius:8px; border:none;"></iframe>`;
  } else {
    wrapper.innerHTML = `<audio controls style="width:100%; height: 30px;"><source src="${link}"></audio>`;
  }
}

async function saveBorrador() {
  if (!currentSong) return; 
  setBusy(true, "Guardando...");
  
  const editorArea = document.getElementById('lyrics-editor');
  const rawText = isEditMode ? editorArea.innerText : Render.toRaw(editorArea);

  const upd = { 
    ...currentSong, 
    lyrics: esToUs(rawText), 
    key: document.getElementById('m-key-sel').value, 
    rhythm: document.getElementById('m-rhythm-in').value, 
    artist: document.getElementById('m-artist-in').value, 
    album: document.getElementById('m-album-in').value, 
    year: parseInt(document.getElementById('m-year-in').value) || "", 
    copyright: document.getElementById('m-copyright-in').value, 
    biography: document.getElementById('m-biography-in').value, 
    sheetMusicLink: document.getElementById('m-sheet-in').value, 
    link: document.getElementById('m-audio-in').value,
    moments: getSelectedMoments()
  };
  
  try { 
    await db.ref(`canciones_borrador/${currentSong.id}`).update(upd); 
    hasUnsavedChanges = false;
    alert("✅ Cambios guardados en Borrador."); 
  } catch (e) { 
    alert("Error al guardar."); 
  } 
  setBusy(false);
}

async function confirmPublish() {
  if (!confirm("🚀 ¿Publicar Versión Oficial para todos los usuarios?")) return; 
  setBusy(true, "Publicando...");
  try {
    const snap = await db.ref('canciones_borrador').get();
    let p = globalVer.split('.'); 
    if (p.length < 2) p = [globalVer, "000"];
    const v = p[0] + "." + String(parseInt(p[p.length-1]) + 1).padStart(3, '0');
    
    await db.ref('canciones_base').set(snap.val()); 
    await db.ref('version').set(v); 
    alert("🎉 Publicación Exitosa. Nueva versión: v" + v);
  } catch (e) { 
    alert("Error en la publicación."); 
  } 
  setBusy(false);
}

function usToEs(t) { return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { const r = c.match(/^([A-G])([#b]?)(.*)/); if (!r) return m; return `[${{"C":"Do","D":"Re","E":"Mi","F":"Fa","G":"Sol","A":"La","B":"Si"}[r[1]]}${r[2]}${r[3]}]`; }); }
function esToUs(t) { return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { const roots = ["Sol","Do","Re","Mi","Fa","La","Si"]; for (let r of roots) { if (c.startsWith(r)) { let a = "", rest = c.slice(r.length); if (rest.startsWith("#") || rest.startsWith("b")) { a = rest[0]; rest = rest.slice(1); } return `[${{"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[r]}${a}${rest}]`; } } return m; }); }

function setBusy(on, t) { 
  document.getElementById('busy-overlay').style.display = on ? 'flex' : 'none'; 
  document.getElementById('busy-text').innerText = t || "Cargando..."; 
}
