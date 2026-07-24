let allSongs = [];
let currentSong = null;
let globalVer = "0";
let isEditMode = false;

function initApp() {
  const sel = document.getElementById('m-key-sel'); 
  sel.innerHTML = '<option value="">Sin tono</option>';
  
  ["Do","Dom","Do#","Do#m","Re","Rem","Mi","Mim","Fa","Fam","Fa#","Fa#m","Sol","Solm","La","Lam","Si","Sim"].forEach(k => {
    let v = {"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[k.replace('m','')] + (k.includes('m')?'m':'');
    sel.appendChild(new Option(k, v));
  });
  
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
    const l = s.lyrics.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.includes(q) || l.includes(q);
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
  document.getElementById('m-title-in').value = s.title;
  document.getElementById('m-artist-in').value = s.artist || "";
  document.getElementById('m-key-sel').value = s.key || "";
  document.getElementById('m-rhythm-in').value = s.rhythm || "";
  document.getElementById('m-audio-in').value = s.link || "";
  document.getElementById('lyrics-editor').value = usToEs(s.lyrics);
  
  isEditMode = false; 
  document.getElementById('lyrics-editor').readOnly = true;
  document.getElementById('mode-text').innerText = "MODO ACORDES";
  document.getElementById('pencil-btn').style.color = "#555";
  
  refreshUI(); 
  filterSongs();
}

function toggleEditMode() {
  if (userRole !== 'super_admin') return;
  isEditMode = !isEditMode;
  const area = document.getElementById('lyrics-editor'); 
  area.readOnly = !isEditMode;
  document.getElementById('mode-text').innerText = isEditMode ? "MODO LETRA (MAESTRO)" : "MODO ACORDES";
  document.getElementById('pencil-btn').style.color = isEditMode ? "#4DB6AC" : "#555";
  if (isEditMode) area.focus();
}

function setupEditorListeners() {
  const area = document.getElementById('lyrics-editor');
  area.onkeydown = (e) => {
    if (!isEditMode && !e.altKey && !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) { 
      if (!e.ctrlKey) e.preventDefault(); 
    }
    const map = {"d":"Do","r":"Re","m":"Mi","f":"Fa","s":"Sol","l":"La","i":"Si"};
    const k = e.key.toLowerCase();
    
    if (e.altKey && map[k]) { e.preventDefault(); insChord(map[k]); }
    if (e.altKey && e.key === "Backspace") { e.preventDefault(); delChord(); }
  };
  area.oninput = refreshUI;
}

function insChord(t) {
  const area = document.getElementById('lyrics-editor'); 
  const start = area.selectionStart; 
  const chord = `[${t}]`;
  area.value = area.value.slice(0, start) + chord + area.value.slice(area.selectionEnd);
  area.selectionStart = start; 
  area.selectionEnd = start + chord.length;
  refreshUI(); 
  area.focus();
}

function insManual() {
  const v = document.getElementById('manual-chord-in').value.trim();
  if (v) { 
    insChord(v); 
    document.getElementById('manual-chord-in').value = ""; 
  }
}

function delChord() {
  const area = document.getElementById('lyrics-editor');
  const txt = area.value;
  const start = area.selectionStart;
  const o = txt.lastIndexOf('[', start);
  const c = txt.indexOf(']', start);
  
  if (o !== -1 && c !== -1 && o < start && c >= start-1) { 
    area.value = txt.slice(0, o) + txt.slice(c + 1); 
    area.selectionStart = area.selectionEnd = o; 
    refreshUI(); 
  }
  area.focus();
}

async function saveBorrador() {
  if (!currentSong) return; 
  setBusy(true, "Guardando...");
  const upd = { 
    ...currentSong, 
    lyrics: esToUs(document.getElementById('lyrics-editor').value), 
    artist: document.getElementById('m-artist-in').value, 
    key: document.getElementById('m-key-sel').value, 
    rhythm: document.getElementById('m-rhythm-in').value, 
    link: document.getElementById('m-audio-in').value 
  };
  
  try { 
    await db.ref(`canciones_borrador/${currentSong.id}`).update(upd); 
    alert("✅ Guardado."); 
  } catch (e) { 
    alert("Error."); 
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

function refreshUI() {
  const raw = document.getElementById('lyrics-editor').value;
  const fmt = raw.replace(/\{([\s\S]*?)\}/g, '<span style="color:#888; font-style:italic">$1</span>')
                 .replace(/\*\*_([\s\S]*?)_\*\*/g, '<b><i>$1</i></b>')
                 .replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>')
                 .replace(/_([\s\S]*?)_/g, '<i>$1</i>')
                 .replace(/\[([^\]]+)\]/g, '<span class="chordchip">$1</span>');
  document.getElementById('preview-box').innerHTML = fmt.replace(/\n/g, '<br>');
}

function switchMod(mod) {
  document.querySelectorAll('main').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mod-${mod}`).style.display = 'grid';
  event.target.classList.add('active');
}

function usToEs(t) { 
  return t.replace(/\[([^\]]+)\]/g, (m, c) => { 
    const r = c.match(/^([A-G])([#b]?)(.*)/); 
    if (!r) return m; 
    return `[${{"C":"Do","D":"Re","E":"Mi","F":"Fa","G":"Sol","A":"La","B":"Si"}[r[1]]}${r[2]}${r[3]}]`; 
  }); 
}

function esToUs(t) { 
  return t.replace(/\[([^\]]+)\]/g, (m, c) => { 
    const roots = ["Sol","Do","Re","Mi","Fa","La","Si"]; 
    for (let r of roots) { 
      if (c.startsWith(r)) { 
        let a = "", rest = c.slice(r.length); 
        if (rest.startsWith("#") || rest.startsWith("b")) { 
          a = rest[0]; 
          rest = rest.slice(1); 
        } 
        return `[${{"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[r]}${a}${rest}]`; 
      } 
    } 
    return m; 
  }); 
}

function setBusy(on, t) { 
  document.getElementById('busy-overlay').style.display = on ? 'flex' : 'none'; 
  document.getElementById('busy-text').innerText = t || "Cargando..."; 
}
