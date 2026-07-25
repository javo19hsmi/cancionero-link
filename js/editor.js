/* ==========================================================
   1. VARIABLES GLOBALES DE ESTADO DEL EDITOR
   ========================================================== */
let allSongs = [];             // Lista completa de canciones obtenidas de Firebase
let currentSong = null;        // Canción actualmente seleccionada y en edición
let globalVer = "0";           // Versión global actual de la base de datos
let isEditMode = false;        // Estado de edición de texto maestro (false = modo acordes visuales)
let hasUnsavedChanges = false; // Bandera para advertir si hay cambios sin guardar
let editorListenersAttached = false; // Control para evitar duplicar los eventos del teclado/mouse
let activeChordNode = null;    // Guarda el nodo del acorde actualmente seleccionado (en naranja)
let savedRange = null; // Guarda la última posición conocida del cursor en el texto

/* ==========================================================
   2. EL MOTOR DE RENDERIZADO (TRANSFORMACIONES VISUALES Y CRUDAS)
   ========================================================== */
const Render = {
    // Convierte el texto plano de Firebase ([Do], **texto**) a HTML visual para el editor
    toVisual: function(rawText) {
        if (!rawText) return "";
        let html = rawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html = html.replace(/\*\*_([\s\S]*?)_\*\*/g, "<b><i>$1</i></b>");
        html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
        html = html.replace(/_([\s\S]*?)_/g, "<i>$1</i>");
        html = html.replace(/\{([\s\S]*?)\}/g, "<span style='color:#888; font-style:italic'>$1</span>");
        
        // Transforma los corchetes [Do] en globitos visuales vacíos por dentro (el CSS hace la magia)
        html = html.replace(/\[([^\]]+)\]/g, (match, chord) => {
            return `<span class="chord-chip" contenteditable="false" data-chord="${chord}"></span>`;
        });
        return html.replace(/\n/g, "<br>");
    },
    // Convierte el contenido visual del editor de vuelta a formato texto plano para guardar en Firebase
    toRaw: function(htmlElement) {
        let clone = htmlElement.cloneNode(true);
        
        // Recuperar los corchetes originales de los acordes
        clone.querySelectorAll('.chord-chip').forEach(chip => {
            chip.replaceWith(`[${chip.getAttribute('data-chord')}]`);
        });
        
        // Recuperar etiquetas de formato Markdown (Negritas y Cursivas)
        clone.querySelectorAll('b').forEach(b => {
            if(b.querySelector('i')) { b.replaceWith(`**_${b.innerText}_**`); } 
            else { b.replaceWith(`**${b.innerText}**`); }
        });
        clone.querySelectorAll('i').forEach(i => i.replaceWith(`_${i.innerText}_`));

        // Normalizar saltos de línea
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('div').forEach(div => { div.prepend('\n'); div.replaceWith(...div.childNodes); });
        
        let rawText = clone.textContent || clone.innerText || "";
        return rawText.replace(/\n\n/g, '\n');
    }
};

/* ==========================================================
   3. LISTA DE MOMENTOS LITÚRGICOS DISPONIBLES
   ========================================================== */
const MOMENTS_LIST = [
  "Entrada", "Acto Penitencial", "Gloria", "Salmos", "Aclamación al Evangelio",
  "Credo", "Ofertorio", "Santo", "Aclamaciones", "Doxologia Final",
  "Padre Nuestro/Tuyo es el Reino", "Cordero de Dios", "Comunión", "Meditación", "Salida",
  "Virgen María", "Espíritu Santo", "Animación", "Adoración Eucarística",
  "Adviento", "Navidad", "Cuaresma", "Semana Santa", "Pascua y Pentecostés","Santo Rosario",
  "Via Crucis", "Pesebre", "Juveniles", "Acción de Gracia", "Misioneros / Vocacionales",
  "Bautismo", "Matrimonios", "Santos y Devociones", "Misa con Niños", "Exequias", "Propios del Ordinario", 
    "Varios"
];

/* ==========================================================
   4. INICIALIZACIÓN DE LA APLICACIÓN Y ESCUCHAS DE FIREBASE
   ========================================================== */
function initApp() {
  // Carga el selector de tonos musicales principales
  const sel = document.getElementById('m-key-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Sin tono</option>';
    ["Do","Dom","Do#","Do#m","Re","Rem","Mi","Mim","Fa","Fam","Fa#","Fa#m","Sol","Solm","La","Lam","Si","Sim"].forEach(k => {
      let v = {"Do":"C","Re":"D","Mi":"E","Fa":"F","Sol":"G","La":"A","Si":"B"}[k.replace('m','')] + (k.includes('m')?'m':'');
      sel.appendChild(new Option(k, v));
    });
  }
  
  // Escucha cambios de versión y borradores en tiempo real desde Firebase Realtime Database
  db.ref('version').on('value', s => { globalVer = String(s.val() || "0"); });
  db.ref('canciones_borrador').on('value', s => { 
    if (s.exists()) { 
      allSongs = Object.values(s.val()).sort((a,b) => a.title.localeCompare(b.title)); 
      filterSongs(); 
    } 
  });
  
  setupEditorListeners();
}

/* ==========================================================
   5. FILTRADO Y CARGA DE CANCIONES
   ========================================================== */
// Filtra la lista de canciones en el panel izquierdo según lo que escribas en el buscador
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

// Carga los datos de una canción seleccionada en los inputs del formulario y en el editor
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
  setTimeout(autoExpandBio, 50); // Estira el cuadro al cargar la canción
}

/* ==========================================================
   6. GESTIÓN DE MOMENTOS LITÚRGICOS (CHIPS Y DIÁLOGOS)
   ========================================================== */
// Dibuja los momentos seleccionados en el panel derecho de la canción
function renderMomentsChips(selectedArr) {
  const container = document.getElementById("moments-container");
  if (!container) return;
  container.innerHTML = "";
  
  const moments = (selectedArr || ["Varios"]).filter(Boolean);
  
  moments.forEach(m => {
    const chip = document.createElement("div");
    chip.className = "chip-selected";
    chip.innerHTML = `
      <span>${m}</span>
      <span class="chip-remove-btn" onclick="removeMoment('${m}')">×</span>
    `;
    container.appendChild(chip);
  });
}

// Abre la ventana flotante (diálogo) con la lista completa de momentos litúrgicos
function openMomentsDialog() {
  const listEl = document.getElementById("full-moments-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  
  const current = new Set(currentSong && currentSong.moments ? currentSong.moments : []);

  MOMENTS_LIST.forEach(m => {
    const d = document.createElement("div");
    d.className = "chip" + (current.has(m) ? " on" : "");
    d.textContent = m;
    d.onclick = () => {
      toggleMoment(m);
      d.classList.toggle("on");
    };
    listEl.appendChild(d);
  });
  
  document.getElementById("moments-dialog").style.display = "flex";
}

// Añade o quita un momento litúrgico de la canción activa
function toggleMoment(m) {
  if (!currentSong) return;
  if (!currentSong.moments) currentSong.moments = [];
  const idx = currentSong.moments.indexOf(m);
  
  if (idx > -1) {
    currentSong.moments.splice(idx, 1);
  } else {
    currentSong.moments.push(m);
  }
  
  if (currentSong.moments.length === 0) currentSong.moments = ["Varios"];
  renderMomentsChips(currentSong.moments);
  markUnsavedChanges();
}

// Remueve un momento al hacer clic en la "×" del chip seleccionado
function removeMoment(m) {
  toggleMoment(m); 
}

// Cierra el diálogo flotante de momentos
function closeMomentsDialog() {
  const dlg = document.getElementById("moments-dialog");
  if (dlg) dlg.style.display = "none";
}

// Devuelve un arreglo con los momentos activos actuales para guardar en Firebase
function getSelectedMoments() {
  if (currentSong && currentSong.moments) return currentSong.moments;
  return ["Varios"];
}

/* ==========================================================
   7. CONTROLES GENERALES DEL EDITOR Y PERMISOS
   ========================================================== */
function markUnsavedChanges() {
    hasUnsavedChanges = true;
}

// Aplica permisos de usuario según su rol y accesos otorgados
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

// Cambia de pestaña principal en la interfaz
function switchMod(mod) {
  document.querySelectorAll('main').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const targetMain = document.getElementById(`mod-${mod}`);
  if (targetMain) targetMain.style.display = 'grid';
  if(event && event.target) event.target.classList.add('active');
}

// Alterna entre el Modo Acordes visuales y el Modo Letra (Texto maestro con corchetes)
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

/* ==========================================================
   8. SISTEMA DE SELECCIÓN Y EVENTOS DEL EDITOR
   ========================================================== */
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
if (area) {
    area.setAttribute("inputmode", "none"); // Impide que aparezca el teclado nativo de Android
}
  
  // 1. Detectar clics del mouse para seleccionar un acorde y guardar la posición del cursor
  area.addEventListener('click', (e) => {
      if (isEditMode) return;
      
      // Guardamos la posición exacta del cursor para los teclados virtuales
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && area.contains(sel.anchorNode)) {
          savedRange = sel.getRangeAt(0);
      }

      if (e.target.classList.contains('chord-chip')) {
          selectChord(e.target);
      } else {
          clearChordSelection();
      }
  });

  // 2. Guardar posición también al usar las teclas de movimiento común
  area.addEventListener('keyup', () => {
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && area.contains(sel.anchorNode)) {
          savedRange = sel.getRangeAt(0);
      }
  });

   // Evita que los celulares desplieguen su teclado nativo al tocar el área de letras
  area.addEventListener('focus', (e) => {
      if (window.innerWidth <= 768) {
          // En celulares, quitamos el foco nativo para que no se abra el teclado de Android
          area.blur();
      }
  });

  // Bloquea el teclado nativo del celular para que solo se usen tus botones de acordes
  area.addEventListener('beforeinput', (e) => { 
      if (!isEditMode) {
          e.preventDefault(); // Detiene el teclado flotante del celular
      }
  });

  area.addEventListener('keydown', (e) => {
    if (isEditMode) return; 

    const k = e.key.toLowerCase();
    const rootMap = {"d":"Do","r":"Re","m":"Mi","f":"Fa","s":"Sol","l":"La","i":"Si"};
    const mods = {"#":"#","b":"b","-":"-","7":"7"};

    // 1. NAVEGACIÓN Y BORRADO RÁPIDO CON LA TECLA ALT
    if (e.altKey) {
        if (e.key === "ArrowLeft") { e.preventDefault(); jumpToChord(-1); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); jumpToChord(1); return; }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); delMob(); return; }
    }

    // 2. PERMITIR NAVEGACIÓN NORMAL CON FLECHAS (sin Alt) DESELECCIONA ACORDES
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key) && !e.altKey) {
        clearChordSelection(); 
        return;
    }
    
    // 3. PERMITIR ATAJOS DEL SISTEMA (Ctrl+C, Ctrl+V, etc.)
    if (e.ctrlKey || e.metaKey) return;

    // 4. BLOQUEO DE ESCRITURA DE TEXTO + INSERCIÓN DE ACORDES POR TECLADO
    e.preventDefault(); 
    e.stopPropagation(); 
    
    if (rootMap[k]) { 
        insMob(rootMap[k]); 
    } 
    else if (mods[k]) { 
        modMob(mods[k]); 
    } 
    // Borrado directo si hay un acorde naranja activo
    else if ((e.key === "Backspace" || e.key === "Delete") && activeChordNode) { 
        delMob(); 
    }
  });
}

// Muestra u oculta el teclado (Panel lateral en PC / Barra inferior en Celular)
function toggleAcordes() {
  const isMobile = window.innerWidth <= 768;
  const btn = document.getElementById("toggleAcordesBtn");
  
  if (isMobile) {
    const bar = document.getElementById("mobileChordBar");
    if (!bar) return;
    
    const isVisible = bar.style.display === "block";
    bar.style.display = isVisible ? "none" : "block";
    if (btn) btn.innerText = isVisible ? "Mostrar Teclado" : "Ocultar Teclado";
  } else {
    const col = document.getElementById("acordesCol");
    if (!col) return;
    
    const isHidden = col.style.display === "none" || col.style.display === "";
    col.style.display = isHidden ? "block" : "none";
    if (btn) btn.innerText = isHidden ? "Ocultar Teclado" : "Mostrar Teclado";
  }
}

/* ==========================================================
   9. INSERCIÓN, MODIFICACIÓN Y NAVEGACIÓN DE ACORDES
   ========================================================== */
// Inserta un nuevo acorde visual respetando la posición memorizada del cursor
function insChordVisual(chordText) {
  const area = document.getElementById('lyrics-editor');
  area.focus();

  const sel = window.getSelection();
  
  // Restauramos la posición donde el usuario hizo clic por última vez
  if (savedRange && area.contains(savedRange.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
  } else if (!sel.rangeCount || !area.contains(sel.anchorNode)) {
      // Si no hay memoria previa, lo ubicamos al final del texto por seguridad
      const range = document.createRange();
      range.selectNodeContents(area);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
  }

  const id = 'chord-' + Date.now();
  const html = `<span id="${id}" class="chord-chip" contenteditable="false" data-chord="${chordText}"></span>`;
  document.execCommand('insertHTML', false, html);
  markUnsavedChanges();
  if(navigator.vibrate) navigator.vibrate(10); 
  
  setTimeout(() => {
      const newNode = document.getElementById(id);
      if (newNode) {
          selectChord(newNode); // Pone el acorde en naranja
          
          const selNew = window.getSelection();
          const rangeNew = document.createRange();
          rangeNew.setStartAfter(newNode);
          rangeNew.collapse(true);
          selNew.removeAllRanges();
          selNew.addRange(rangeNew);
          
          // Actualizamos la memoria con la nueva posición después de insertar
          savedRange = rangeNew;
      }
  }, 10);
}

// Inserta o reemplaza un acorde (si ya hay uno seleccionado en naranja, lo transforma)
function insMob(chordText) {
    if (activeChordNode) {
        activeChordNode.setAttribute('data-chord', chordText);
        markUnsavedChanges();
    } else {
        insChordVisual(chordText);
    }
}

// Inserta un acorde escrito manualmente desde el input secundario con validación estricta
function insManual() {
  const inputEl = document.getElementById('manual-chord-in');
  if (!inputEl) return;
  const v = inputEl.value.trim();
  
  if (!v) return;

  // EXPRESIÓN REGULAR DE VALIDACIÓN MUSICAL
  const chordRegex = /^((?:Do|Re|Mi|Fa|Sol|La|Si)|(?:[A-G]))([#b]?)(m?)(-?)(7?)(sus4|sus2|maj7|6|9)?$/i;

  if (!chordRegex.test(v)) {
      alert("❌ Acorde no válido. Por favor ingresá un formato correcto (Ej: Do, Rem, Sol7, Fa#).");
      inputEl.focus();
      return;
  }

  // Si pasa la validación, lo inserta en el lugar memorizado
  insChordVisual(v); 
  inputEl.value = ""; 
}

// Salta de un acorde a otro hacia adelante (+1) o hacia atrás (-1) de forma inteligente
function jumpToChord(dir) {
    const editor = document.getElementById('lyrics-editor');
    const chords = Array.from(editor.querySelectorAll('.chord-chip'));
    if (chords.length === 0) return;

    let targetChord = null;

    if (activeChordNode) {
        let currentIndex = chords.indexOf(activeChordNode) + dir;
        if (currentIndex >= chords.length) currentIndex = 0;
        if (currentIndex < 0) currentIndex = chords.length - 1;
        targetChord = chords[currentIndex];
    } else {
        const sel = window.getSelection();
        if (!sel.rangeCount) {
            targetChord = chords[dir > 0 ? 0 : chords.length - 1];
        } else {
            const cursorNode = sel.focusNode;
            if (dir > 0) {
                for (let chord of chords) {
                    if (cursorNode.compareDocumentPosition(chord) & Node.DOCUMENT_POSITION_FOLLOWING) {
                        targetChord = chord;
                        break;
                    }
                }
                if (!targetChord) targetChord = chords[0];
            } else {
                for (let i = chords.length - 1; i >= 0; i--) {
                    let chord = chords[i];
                    if (cursorNode.compareDocumentPosition(chord) & Node.DOCUMENT_POSITION_PRECEDING) {
                        targetChord = chord;
                        break;
                    }
                }
                if (!targetChord) targetChord = chords[chords.length - 1];
            }
        }
    }

    if (!targetChord) return;

    selectChord(targetChord);

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStartAfter(targetChord);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

// Modifica las alteraciones del acorde activo seleccionado ( Sostenidos #, Bemoles b, Menores m/-, Séptimas 7 )
function modMob(mod) {
    if (activeChordNode) {
        let chord = activeChordNode.getAttribute('data-chord');
        
        // Expresión regular robusta que separa la nota raíz, alteraciones, menores y séptimas
        const m = chord.match(/^((?:Do|Re|Mi|Fa|Sol|La|Si)|(?:[A-G]))([#b]?)(m?)(7?)/i);
        if (!m) return;
        
        let root = m[1];
        let acc = m[2] || "";
        let minor = m[3] || "";
        let sev = m[4] || "";
        
        if (mod === "#") {
            acc = (acc === "#") ? "" : "#";
            if (acc === "#") acc = (acc === "b") ? "" : "#"; // Limpia bemol si ponemos sostenido
        } else if (mod === "b") {
            acc = (acc === "b") ? "" : "b";
        } else if (mod === "m" || mod === "-") { 
            // Alterna la "m" de menor de forma limpia
            minor = (minor.toLowerCase() === "m") ? "" : "m";
        } else if (mod === "7") {
            sev = (sev === "7") ? "" : "7";
        }

        const newChord = root + acc + minor + sev;
        activeChordNode.setAttribute('data-chord', newChord);
        markUnsavedChanges();
    }
}

// Borra el acorde activo seleccionado y reubica la selección en el anterior
function delMob() {
    if (activeChordNode) {
        const nodeToDelete = activeChordNode;
        jumpToChord(-1); 
        if (activeChordNode === nodeToDelete) {
            clearChordSelection();
        }
        nodeToDelete.remove();
        markUnsavedChanges();
    }
}

/* ==========================================================
   10. GESTIÓN DE ARCHIVOS MULTIMEDIA (AUDIO Y YOUTUBE)
   ========================================================== */
async function uploadFile(input, folder, targetInputId) {
  const file = input.files[0];
  if (!file || !currentSong) return;

  const status = document.getElementById("uploadStatus");
  const linkInput = document.getElementById(targetInputId);
  
  if (status) status.textContent = "⏳ Subiendo archivo a Storage...";
  setBusy(true, "Subiendo archivo...");

  try {
    const fileName = `${currentSong.id}_${Date.now()}_${file.name}`;
    const ref = storage.ref(`canciones/${folder}/${fileName}`);
    await ref.put(file);
    const downloadUrl = await ref.getDownloadURL();
    
    if (linkInput) linkInput.value = downloadUrl;
    if (status) status.textContent = "✅ Archivo subido con éxito.";
    markUnsavedChanges();
    if(folder === 'audios') updateAudioPreview();
  } catch (error) {
    if (status) status.textContent = `❌ Error: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

// Actualiza la vista previa del reproductor multimedia (YouTube, Google Drive o MP3 directo)
function updateAudioPreview() {
  const linkInput = document.getElementById("m-audio-in");
  if (!linkInput) return;
  const link = linkInput.value.trim();
  const container = document.getElementById("audioPreviewContainer");
  const wrapper = document.getElementById("playerWrapper");

  if (!link) { 
    if (container) container.style.display = "none"; 
    if (wrapper) wrapper.innerHTML = ""; 
    return; 
  }

  if (container) container.style.display = "block";
  if (wrapper) wrapper.innerHTML = "";

  // 1. Reproductor para enlaces de YouTube
  if (link.includes("youtube.com") || link.includes("youtu.be")) {
    let videoId = "";
    try {
      if (link.includes("v=")) videoId = link.split("v=")[1].split("&")[0];
      else videoId = link.split("/").pop().split("?")[0];
      if (wrapper) wrapper.innerHTML = `<iframe width="100%" height="180" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="border-radius:8px; border:none;"></iframe>`;
    } catch (e) {
      if (wrapper) wrapper.innerHTML = '<p style="color:red; font-size:12px;">Error en link de YouTube</p>';
    }
  } 
  // 2. Botón de acceso directo para Google Drive
  else if (link.includes("drive.google.com")) {
    let fileId = "";
    try {
      const match = link.match(/[-\w]{25,}/);
      fileId = match ? match[0] : "";
      if (fileId && wrapper) {
        wrapper.innerHTML = `
          <div style="background:rgba(255,255,255,0.05); border:1px dashed #4DB6AC; padding:15px; border-radius:8px; text-align:center;">
            <div style="margin-bottom:10px; color:#aaa; font-size:11px;">
              Archivo de Google Drive detectado
            </div>
            <a href="${link}" target="_blank" 
               style="display:inline-block; background:#2196F3; color:white; padding:8px 16px; border-radius:20px; text-decoration:none; font-size:12px; font-weight:bold; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
               ▶️ REPRODUCIR EN DRIVE
            </a>
            <p style="font-size:9px; color:#666; margin-top:8px; line-height:1.2;">
              Por seguridad de Google, el audio se abre en pestaña nueva.
            </p>
          </div>`;
      }
    } catch (e) { if (wrapper) wrapper.innerHTML = '<p style="color:red; font-size:11px;">Error al procesar Drive</p>'; }
  }
  // 3. Reproductor nativo de audio estándar (MP3 / Firebase Storage)
  else {
    if (wrapper) {
      wrapper.innerHTML = `
        <audio controls style="width:100%; height:35px;">
          <source src="${link}" type="audio/mpeg">
        </audio>
      `;
      const audio = wrapper.querySelector('audio');
      if (audio) audio.load();
    }
  }
}

/* ==========================================================
   11. GUARDADO Y PUBLICACIÓN GLOBAL EN FIREBASE
   ========================================================== */
// Guarda los cambios de la canción activa en la colección de borradores
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

// Publica oficialmente todos los borradores para que se reflejen en la app principal de los usuarios
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

/* ==========================================================
   12. FUNCIONES AUXILIARES DE TRADUCCIÓN Y ESTADOS DE CARGA
   ========================================================== */
// Traduce notación científica americana (C, D, E) a española (Do, Re, Mi) para el editor
function usToEs(t) { 
  return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { 
    const r = c.match(/^([A-G])([#b]?)(.*)/); 
    if (!r) return m; 
    return `[${{"C":"Do","D":"Re","E":"Mi","F":"Fa","G":"Sol","A":"La","B":"Si"}[r[1]]}${r[2]}${r[3]}]`; 
  }); 
}

// Traduce notación española (Do, Re, Mi) a científica americana (C, D, E) para guardar
function esToUs(t) { 
  return (t||"").replace(/\[([^\]]+)\]/g, (m, c) => { 
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

// Muestra u oculta la pantalla flotante de carga / procesos pesados
function setBusy(on, t) { 
  const overlay = document.getElementById('busy-overlay');
  const text = document.getElementById('busy-text');
  if (overlay) overlay.style.display = on ? 'flex' : 'none'; 
  if (text) text.innerText = t || "Cargando..."; 
}

// ==========================================================
// AUTO-EXPANSIÓN DEL CUADRO DE BIOGRAFÍA
// ==========================================================
function autoExpandBio() { 
  const el = document.getElementById('m-biography-in'); 
  if (!el) return;
  el.style.height = 'auto'; // Resetea la altura para recalcular
  el.style.height = (el.scrollHeight) + 'px'; // Se adapta al contenido real
}
