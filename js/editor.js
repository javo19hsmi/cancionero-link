let allSongs = [];
let currentSong = null;
let globalVer = "0";
let isEditMode = false;

function initApp() {
  // 1. Cargar el selector de Tonos
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
    div.onclick = () => loadSong(s); 
    res.appendChild(div);
  });
}

function loadSong(s) {
  currentSong = JSON.parse(JSON.stringify(s));
  
  // Llenar metadatos
  document.getElementById('m-title-in').value = s.title || "";
  document.getElementById('m-artist-in').value = s.artist || "";
  document.getElementById('m-key-sel').value = s.key || "";
  document.getElementById('m-rhythm-in').value = s.rhythm || "";
  document.getElementById('m-audio-in').value = s.link || "";

  // Render Visual
  const editor = document.getElementById('lyrics-editor');
  editor.innerHTML = Render.toVisual(usToEs(s.lyrics));
  
  isEditMode = false; 
  document.getElementById('mode-text').innerText = "MODO ACORDES";
  if (document.getElementById('pencil-btn')) document.getElementById('pencil-btn').style.color = "#555";
  
  filterSongs();
}

function toggleEditMode() {
  if (userRole !== 'super_admin') return;
  isEditMode = !isEditMode;
  const area = document.getElementById('lyrics-editor'); 
  
  if (isEditMode) {
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

function setupEditorListeners() {
  const area = document.getElementById('lyrics-editor');
  
  area.addEventListener('beforeinput', (e) => {
    if (!isEditMode) e.preventDefault(); 
  });

  area.addEventListener('keydown', (e) => {
    if (isEditMode) return; 

    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    e.preventDefault(); 

    const k = e.key.toLowerCase();
    const rootMap = {"d":"Do","r":"Re","m":"Mi","f":"Fa","s":"Sol","l":"La","i":"Si"};
    
    if (rootMap[k]) {
        insChordVisual(rootMap[k]);
    } else if (["#", "b", "-", "7"].includes(k)) {
        modifyLastChordVisual(k);
    } else if (e.key === "Backspace" || e.key === "Delete") {
        deleteLastChordVisual();
    }
  });
}

function insChordVisual(chordText) {
  const area = document.getElementById('lyrics-editor');
  area.focus();
  const html = `<span class="chord-chip" contenteditable="false" data-chord="${chordText}">${chordText}</span>\u200B`;
  document.execCommand('insertHTML', false, html);
}

function modifyLastChordVisual(mod) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    let node = selection.focusNode;
    let prevNode = getPreviousNode(node, selection.focusOffset);

    if (prevNode && prevNode.classList && prevNode.classList.contains('chord-chip')) {
        let chord = prevNode.getAttribute('data-chord');
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
        prevNode.setAttribute('data-chord', newChord);
        prevNode.innerText = newChord; 
    }
}

function deleteLastChordVisual() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    let node = selection.focusNode;
    let prevNode = getPreviousNode(node, selection.focusOffset);

    if (prevNode && prevNode.classList && prevNode.classList.contains('chord-chip')) {
        prevNode.remove();
    }
}

function getPreviousNode(node, offset) {
    if (node.nodeType === Node.TEXT_NODE && offset === 0) return node.previousSibling;
    else if (node.nodeType === Node.ELEMENT_NODE && offset > 0) return node.childNodes[offset - 1];
    return null;
}

async function saveBorrador() {
  if (!currentSong) return; 
  setBusy(true, "Guardando...");
  
  // Extraemos el texto crudo según el modo (Visual o Maestro)
  const editorArea = document.getElementById('lyrics-editor');
  const rawText = isEditMode ? editorArea.innerText : Render.toRaw(editorArea);

  const upd = { 
    ...currentSong, 
    lyrics: esToUs(rawText), 
    artist: document.getElementById('m-artist-in').value, 
    key: document.getElementById('m-key-sel').value, 
    rhythm: document.getElementById('m-rhythm-in').value, 
    link: document.getElementById('m-audio-in').value 
  };
  
  try { 
    await db.ref(`canciones_borrador/${currentSong.id}`).update(upd); 
    alert("✅ Guardado en Borrador."); 
  } catch (e) { 
    alert("Error al guardar."); 
  } 
  setBusy(false);
}

async function confirmPublish() {
  if (!confirm("🚀 ¿Publicar Versión Oficial?")) return; 
  setBusy(true, "Publicando...");
  try {
    const snap = await db.ref('canciones_borrador').get();
    let p = globalVer.split('.'); 
    if (p.length < 2) p = [globalVer, "000"];
    const v = p[0] + "." + String(parseInt(p[p.length-1]) + 1).padStart(3, '0');
    
    await db.ref('canciones_base').set(snap.val()); 
    await db.ref('version').set(v); 
    alert("🎉 Éxito: v" + v);
  } catch (e) { 
    alert("Error."); 
  } 
  setBusy(false);
}

function usToEs(t) { return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { const r = c.match(/^([A-G])([#b]?)(.*)/); if (!r) return m; return `[${{"C":"Do","D":"Re","E":"Mi","F":"Fa","G":"Sol","A":"La","B":"Si"}[r[1]]}${r[2]}${r[3]}]`; }); }
function esToUs(t) { return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { const roots = ["Sol","Do","Re","Mi","Fa","La","Si"]; for (let r of roots) { if (c.startsWith(r)) { let a = "", rest = c.slice(r.length); if (rest.startsWith("#") || rest.startsWith("b")) { a = rest[0]; rest = rest.slice(1); } return `[${{"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[r]}${a}${rest}]`; } } return m; }); }

function setBusy(on, t) { 
  document.getElementById('busy-overlay').style.display = on ? 'flex' : 'none'; 
  document.getElementById('busy-text').innerText = t || "Cargando..."; 
}

function switchMod(mod) {
  document.querySelectorAll('main').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mod-${mod}`).style.display = 'grid';
  event.target.classList.add('active');
}
