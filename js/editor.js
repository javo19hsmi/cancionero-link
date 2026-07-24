let allSongs = [];
let currentSong = null;
let globalVer = "0";
let isEditMode = false;

function initApp() {
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
  const editor = document.getElementById('lyrics-editor');
  
  // Transformamos el código de Firebase en la magia visual
  editor.innerHTML = Render.toVisual(usToEs(s.lyrics));
  
  isEditMode = false; 
  document.getElementById('mode-text').innerText = "MODO ACORDES";
  document.getElementById('pencil-btn').style.color = "#555";
  
  filterSongs();
}

function toggleEditMode() {
  if (userRole !== 'super_admin') return;
  isEditMode = !isEditMode;
  const area = document.getElementById('lyrics-editor'); 
  
  if (isEditMode) {
      // ✏️ Entra el Super Admin: Desarmamos los globitos a texto crudo [Do] para que pueda corregir faltas de ortografía
      area.innerText = Render.toRaw(area);
      document.getElementById('mode-text').innerText = "MODO LETRA (MAESTRO)";
      document.getElementById('pencil-btn').style.color = "#4DB6AC";
  } else {
      // 🔒 Sale el Super Admin: Renderizamos todo hermoso de nuevo
      area.innerHTML = Render.toVisual(area.innerText);
      document.getElementById('mode-text').innerText = "MODO ACORDES";
      document.getElementById('pencil-btn').style.color = "#555";
  }
  area.focus();
}

function setupEditorListeners() {
  const area = document.getElementById('lyrics-editor');
  
  // 🛡️ BARRERA DE SEGURIDAD 1: Bloquea todo intento de escribir, borrar o pegar si no es Maestro
  area.addEventListener('beforeinput', (e) => {
    if (!isEditMode) e.preventDefault(); 
  });

  // 🛡️ BARRERA DE SEGURIDAD 2: El teclado inteligente para insertar acordes en vivo
  area.addEventListener('keydown', (e) => {
    if (isEditMode) return; // Si el lápiz está activo, dejamos que el admin escriba normal

    // Teclas permitidas (Navegación)
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    e.preventDefault(); // Bloqueamos cualquier otra tecla por seguridad

    const k = e.key.toLowerCase();
    const rootMap = {"d":"Do","r":"Re","m":"Mi","f":"Fa","s":"Sol","l":"La","i":"Si"};
    
    if (rootMap[k]) {
        // Inserta un nuevo acorde
        insChordVisual(rootMap[k]);
    } else if (["#", "b", "-", "7"].includes(k)) {
        // Modifica el acorde en el que está el cursor
        modifyLastChordVisual(k);
    } else if (e.key === "Backspace") {
        // Borra el acorde
        deleteLastChordVisual();
    }
  });
}

function insChordVisual(chordText) {
  const area = document.getElementById('lyrics-editor');
  area.focus();
  // El \u200B (Zero-width space) permite que el cursor "salga" del globito para seguir navegando
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
        prevNode.innerText = newChord; // Actualiza el texto visual del globito
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

function usToEs(t) { return t.replace(/\[([^\]]+)\]/g, (m, c) => { const r = c.match(/^([A-G])([#b]?)(.*)/); if (!r) return m; return `[${{"C":"Do","D":"Re","E":"Mi","F":"Fa","G":"Sol","A":"La","B":"Si"}[r[1]]}${r[2]}${r[3]}]`; }); }
function esToUs(t) { return t.replace(/\[([^\]]+)\]/g, (m, c) => { const roots = ["Sol","Do","Re","Mi","Fa","La","Si"]; for (let r of roots) { if (c.startsWith(r)) { let a = "", rest = c.slice(r.length); if (rest.startsWith("#") || rest.startsWith("b")) { a = rest[0]; rest = rest.slice(1); } return `[${{"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[r]}${a}${rest}]`; } } return m; }); }

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
