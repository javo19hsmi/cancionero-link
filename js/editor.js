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
    // Convierte el texto plano de Firebase a HTML visual para el editor de forma limpia
    toVisual: function(rawText) {
        if (!rawText) return "";
        let html = rawText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // 1. Transformar corchetes en chips de acordes antes de aplicar estilos de texto
        html = html.replace(/\[([^\]]+)\]/g, (match, chord) => {
            return `<span class="chord-chip" contenteditable="false" data-chord="${chord}"></span>`;
        });

        // 2. Aplicar formatos de Markdown asegurando que no rompan los chips adyacentes
        html = html.replace(/\*\*_([\s\S]*?)_\*\*/g, "<b><i>$1</i></b>");
        html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
        html = html.replace(/_([\s\S]*?)_/g, "<i>$1</i>");
        html = html.replace(/\{([\s\S]*?)\}/g, "<span style='color:#888; font-style:italic'>$1</span>");
        
        return html.replace(/\n/g, "<br>");
    },

    // Convierte el contenido visual del editor de vuelta a texto plano para Firebase sin romper palabras
    toRaw: function(htmlElement) {
        let clone = htmlElement.cloneNode(true);
        
        // Recuperar los corchetes originales de los acordes
        clone.querySelectorAll('.chord-chip').forEach(chip => {
            chip.replaceWith(`[${chip.getAttribute('data-chord')}]`);
        });
        
        // Recuperar etiquetas de formato Markdown de forma segura
        clone.querySelectorAll('b').forEach(b => {
            if(b.querySelector('i')) { b.replaceWith(`**_${b.innerText.replace(/\n/g, '')}_**`); } 
            else { b.replaceWith(`**${b.innerText.replace(/\n/g, '')}**`); }
        });
        clone.querySelectorAll('i').forEach(i => i.replaceWith(`_${i.innerText.replace(/\n/g, '')}_`));

        // Normalizar saltos de línea y eliminar los saltos de línea basura dentro de palabras cortadas
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('div').forEach(div => { 
            div.prepend('\n'); 
            div.replaceWith(...div.childNodes); 
        });
        
        let rawText = clone.textContent || clone.innerText || "";
        
        // Limpia cualquier salto de línea inesperado que haya quedado cortando una palabra con asteriscos/guiones bajos
        return rawText.replace(/\r/g, '');
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
  const searchBox = document.getElementById('song-search-box');
  const btnLimpiar = document.getElementById('btnLimpiarBusqueda');
  const q = searchBox.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const res = document.getElementById('song-results-list'); 
  res.innerHTML = "";
  
  // Muestra u oculta la "X" dependiendo de si hay texto escrito
  if (btnLimpiar) {
      btnLimpiar.style.display = searchBox.value.length > 0 ? 'block' : 'none';
  }
  
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

// Limpia la caja de búsqueda y vuelve a mostrar toda la lista
function clearSearch() {
    const searchBox = document.getElementById('song-search-box');
    searchBox.value = '';
    filterSongs(); // Vuelve a ejecutar el filtro (que ahora mostrará todo y ocultará la X)
    searchBox.focus(); // Deja el cursor titilando en la caja por si querés escribir otra cosa
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
  // Ocultamos todos los modulares principales
  document.querySelectorAll('main').forEach(m => m.style.display = 'none');
  // Quitamos la clase active de los botones del menú superior
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  
  // Buscamos el módulo seleccionado
  const targetMain = document.getElementById(`mod-${mod}`);
  if (targetMain) {
      // Si es anuncios usa 'grid', si es cancionero también, pero respetando su clase CSS
      targetMain.style.display = 'grid'; 
  }
  
  // Activamos visualmente el botón superior correspondiente
  const activeBtn = document.getElementById(`tab-${mod}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Control inteligente del botón "Subir Versión Pública" (Solo visible en Cancionero)
  const pubBtn = document.getElementById('global-pub-btn');
  if (pubBtn) {
      pubBtn.style.display = (mod === 'songs' && userRole === 'super_admin') ? 'block' : 'none';
  }
  
  // Control del teclado móvil de acordes (Solo visible en Cancionero)
  const chordBar = document.getElementById('mobileChordBar');
  if (chordBar) {
      chordBar.style.display = (mod === 'songs') ? chordBar.style.display : 'none';
  }
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

// Mantiene el cursor visible en celulares y abre la barra de acordes automáticamente
  area.addEventListener('focus', (e) => {
      if (window.innerWidth <= 768 && !isEditMode) {
          // Ya no hacemos area.blur() para no perder el puntero parpadeante (|).
          // El inputmode="none" se encarga de frenar el teclado nativo.
          
          // Hacemos que la barra inferior de acordes se abra sola al tocar la letra
          const bar = document.getElementById("mobileChordBar");
          const btn = document.getElementById("toggleAcordesBtn");
          if (bar && bar.style.display !== "block") {
              bar.style.display = "block";
              if (btn) btn.innerText = "Ocultar Teclado";
          }
      }
  });

   // Ocultar la barra móvil de acordes si el usuario toca otro campo (Ritmo, Biografía, etc.)
  document.addEventListener('focusin', (e) => {
      if (window.innerWidth <= 768) {
          const bar = document.getElementById("mobileChordBar");
          const editor = document.getElementById('lyrics-editor');
          
          // Verificamos que la barra esté visible y que el elemento tocado NO sea el editor de letras
          if (bar && bar.style.display === "block" && e.target !== editor) {
              
              // Si tocamos un input (Título, Ritmo), textarea (Biografía) o select (Tono)
              const tag = e.target.tagName;
              if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                  bar.style.display = "none";
                  
                  // Actualizamos el texto del botón por las dudas
                  const btn = document.getElementById("toggleAcordesBtn");
                  if (btn) btn.innerText = "Mostrar Teclado";
              }
          }
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
// Inserta un nuevo acorde visual respetando la posición memorizada del cursor sin romper formatos
function insChordVisual(chordText) {
    const area = document.getElementById('lyrics-editor');
    area.focus();

    const sel = window.getSelection();
    let range;

    // Restauramos la posición donde el usuario hizo clic por última vez
    if (savedRange && area.contains(savedRange.commonAncestorContainer)) {
        range = savedRange;
    } else if (sel.rangeCount > 0 && area.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
    } else {
        // Si no hay memoria previa, lo ubicamos al final del texto por seguridad
        range = document.createRange();
        range.selectNodeContents(area);
        range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);

    // NUEVO MÉTODO: Creamos el nodo limpiamente en el DOM (chau execCommand)
    const id = 'chord-' + Date.now();
    const chip = document.createElement('span');
    chip.id = id;
    chip.className = 'chord-chip';
    chip.contentEditable = "false";
    chip.setAttribute('data-chord', chordText);

    // Insertamos el nodo sin romper las etiquetas de negrita/cursiva adyacentes
    range.deleteContents(); // Borra si había texto seleccionado
    range.insertNode(chip);

    // Movemos el cursor justo después del acorde
    range.setStartAfter(chip);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    
    // Actualizamos la memoria
    savedRange = range;
    markUnsavedChanges();
    if(navigator.vibrate) navigator.vibrate(10); 
    
    setTimeout(() => {
        const newNode = document.getElementById(id);
        if (newNode) {
            selectChord(newNode); // Pone el acorde en naranja
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

let pendingNewVersion = ""; // Variable temporal para guardar la versión a publicar

// Abre el modal glaseado y calcula el número de versión
function confirmPublish() {
  // 1. Calculamos la nueva versión
  let p = globalVer.split('.'); 
  if (p.length < 2) p = [globalVer, "000"];
  pendingNewVersion = p[0] + "." + String(parseInt(p[p.length-1]) + 1).padStart(3, '0');

  // 2. Cargamos los textos en tu diseño visual
  const oldVerEl = document.getElementById("pub-old-ver");
  const newVerEl = document.getElementById("pub-new-ver");
  if (oldVerEl) oldVerEl.innerText = "v" + globalVer;
  if (newVerEl) newVerEl.innerText = "v" + pendingNewVersion;

  // 3. Mostramos la pantalla flotante
  const dlg = document.getElementById("publish-dialog");
  if (dlg) dlg.style.display = "flex";
}

// Cierra el modal glaseado si el usuario cancela
function closePublishDialog() {
  const dlg = document.getElementById("publish-dialog");
  if (dlg) dlg.style.display = "none";
  pendingNewVersion = ""; 
}

// Publica oficialmente todos los borradores (Se ejecuta al tocar "SÍ, PUBLICAR")
async function executePublish() {
  closePublishDialog(); // Cerramos el cuadro visual
  setBusy(true, "Publicando...");
  try {
    const snap = await db.ref('canciones_borrador').get();
    
    await db.ref('canciones_base').set(snap.val()); 
    await db.ref('version').set(pendingNewVersion); 
    alert("🎉 Publicación Exitosa. Nueva versión oficial: v" + pendingNewVersion);
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


/* ==========================================================
   13. MÓDULO DE GESTIÓN DE ANUNCIOS PARROQUIALES
   ========================================================== */
let allAnnouncements = {};
let currentAnnKey = null;
let currentAnnouncementsRef = null;
let isViewingArchive = false; // 🚀 NUEVO: Controla si vemos activos o archivados

// 1. CARGA DE ANUNCIOS Y CONTROL DE VISTAS
function loadAnnouncementsModule(communities, role) {
    const selector = document.getElementById('community-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    if (role === 'super_admin') {
        const opt = document.createElement('option');
        opt.value = 'anuncios_globales';
        opt.text = '🌎 Anuncio Global (Todas las comunidades)';
        // 🎨 ARREGLO VISUAL: Fondo oscuro y letra blanca
        opt.style.background = "#1e1e1e"; 
        opt.style.color = "#ffffff";
        selector.appendChild(opt);
    }

    if (communities && communities.length > 0) {
        communities.forEach(com => {
            const opt = document.createElement('option');
            
            opt.value = com.path;
            // 🚀 Usamos el nombre real que buscamos en auth.js
            opt.text = `⛪ ${com.nombre.toUpperCase()}`;
            
            // 🎨 ARREGLO VISUAL: Fondo oscuro y letra blanca
            opt.style.background = "#1e1e1e"; 
            opt.style.color = "#ffffff";
            
            selector.appendChild(opt);
        });
    }

    selector.onchange = () => {
        reloadAnnouncementsList();
        newAnnouncement(); 
    };

    if (selector.options.length > 0) {
        selector.onchange();
    }
}


// 🚀 NUEVO: Botón para alternar entre Activos y Archivados
function toggleArchiveView() {
    isViewingArchive = !isViewingArchive;
    
    const titleLabel = document.getElementById('ann-list-title');
    const toggleBtn = document.getElementById('btn-toggle-archive');
    
    if (isViewingArchive) {
        titleLabel.innerText = "ANUNCIOS ARCHIVADOS";
        titleLabel.style.color = "var(--warning)";
        toggleBtn.innerText = "VER ACTIVOS 📢";
        toggleBtn.style.background = "var(--warning)";
        toggleBtn.style.color = "black";
    } else {
        titleLabel.innerText = "ANUNCIOS ACTIVOS";
        titleLabel.style.color = "var(--primary)";
        toggleBtn.innerText = "ARCHIVO 📦";
        toggleBtn.style.background = "rgba(255,255,255,0.1)";
        toggleBtn.style.color = "white";
    }
    
    reloadAnnouncementsList();
    newAnnouncement();
}

// 🚀 NUEVO: Recarga la lista leyendo la ruta correcta según el modo actual
function reloadAnnouncementsList() {
    const selectedPath = document.getElementById('community-selector').value;
    const isGlobal = (selectedPath === 'anuncios_globales');
    let targetDbPath = '';

    // Cambiamos el nodo dependiendo de qué estemos viendo
    if (isViewingArchive) {
        targetDbPath = isGlobal ? 'anuncios_globales_archivados' : `${selectedPath}/anuncios_archivados`;
    } else {
        targetDbPath = isGlobal ? 'anuncios_globales' : `${selectedPath}/anuncios`;
    }
    
    console.log("🔍 Intentando leer ruta Firebase:", targetDbPath); // DEBUG
    
    if (currentAnnouncementsRef) currentAnnouncementsRef.off('value');
    
    currentAnnouncementsRef = db.ref(targetDbPath);
    currentAnnouncementsRef.on('value', snap => {
        console.log("📦 Datos recibidos:", snap.val()); // DEBUG
        allAnnouncements = snap.val() || {};
        renderAnnouncementList();
    });
}

function renderAnnouncementList() {
    const res = document.getElementById('announcement-list');
    if (!res) return;
    res.innerHTML = "";

    // Filtramos para ignorar nodos basura y ordenamos
    Object.entries(allAnnouncements).forEach(([key, ann]) => {
        
        // 🛡️ ESCUDO ANTI-CRASH: Evita que la lista se rompa si Firebase devuelve un dato vacío
        if (!ann || typeof ann !== 'object') return;

        const div = document.createElement('div');
        div.className = `result-item glass ${currentAnnKey === key ? 'active' : ''}`;
        
        // Si está en archivo, le ponemos un tint naranja para diferenciar visualmente
        const borderStyle = isViewingArchive ? 'border-left: 3px solid var(--warning);' : '';

        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; ${borderStyle} padding-left:5px;">
                ${ann.imagenUrl ? `<img src="${ann.imagenUrl}" width="36" height="36" style="border-radius:6px; object-fit:cover">` : `<span class="material-symbols-outlined" style="font-size:24px; color:${isViewingArchive ? 'var(--warning)' : 'var(--primary)'}">${isViewingArchive ? 'inventory_2' : 'campaign'}</span>`}
                <div style="flex:1; overflow:hidden;">
                    <div style="font-weight:bold; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${ann.titulo || 'Sin Título'}</div>
                    <div style="font-size:10px; opacity:0.6">${ann.fecha || 'Sin fecha'}</div>
                </div>
            </div>
        `;
        div.onclick = () => loadSingleAnnouncement(key, ann);
        res.appendChild(div);
    });
}

// 2. GESTIÓN DE LA UI DEL EDITOR Y BOTONES
function loadSingleAnnouncement(key, ann) {
    currentAnnKey = key;
    document.getElementById('ann-title').value = ann.titulo || "";
    document.getElementById('ann-text').value = ann.texto || "";
    document.getElementById('ann-date-label').value = ann.fecha || "";
    document.getElementById('ann-expiry').value = ann.fechaVencimiento || "";
    document.getElementById('ann-image-url').value = ann.imagenUrl || "";
    document.getElementById('ann-btn-text').value = ann.linkTexto || "";
    document.getElementById('ann-btn-url').value = ann.link || "";
    
    const prev = document.getElementById('flyer-preview');
    const img = document.getElementById('ann-img-preview');
    if (ann.imagenUrl) { 
        prev.style.display = 'block'; 
        img.src = ann.imagenUrl; 
    } else { 
        prev.style.display = 'none'; 
    }

    // 🚀 LÓGICA DE BOTONES SEGÚN EL MODO
    const actionBtn = document.getElementById('ann-action-btn');
    const saveBtn = document.getElementById('ann-save-btn');
    
    actionBtn.style.display = 'block';

    if (isViewingArchive) {
        // Modo Restaurar
        actionBtn.innerText = "RESTAURAR ♻️";
        actionBtn.style.color = "var(--primary)";
        actionBtn.style.borderColor = "var(--primary)";
        actionBtn.style.background = "rgba(77,182,172,0.1)";
        saveBtn.style.display = 'none'; // No se edita en el archivo
    } else {
        // Modo Archivar (Lo que antes era Eliminar)
        actionBtn.innerText = "ARCHIVAR 📦";
        actionBtn.style.color = "var(--warning)";
        actionBtn.style.borderColor = "var(--warning)";
        actionBtn.style.background = "rgba(255,167,38,0.1)";
        saveBtn.style.display = 'block'; 
    }

    renderAnnouncementList();
}

function newAnnouncement() {
    currentAnnKey = null;
    document.getElementById('ann-title').value = "";
    document.getElementById('ann-text').value = "";
    document.getElementById('ann-date-label').value = "";
    document.getElementById('ann-expiry').value = "";
    document.getElementById('ann-image-url').value = "";
    document.getElementById('ann-btn-text').value = "";
    document.getElementById('ann-btn-url').value = "";
    
    document.getElementById('flyer-preview').style.display = 'none';
    document.getElementById('ann-action-btn').style.display = 'none';
    
    // Si creás uno nuevo, asegúrate de que el botón de guardar esté visible
    document.getElementById('ann-save-btn').style.display = 'block'; 
    
    renderAnnouncementList();
}

async function saveAnnouncement() {
    const title = document.getElementById('ann-title').value.trim();
    const text = document.getElementById('ann-text').value.trim();
    if(!title || !text) return alert("❌ Título y Mensaje son obligatorios.");

    setBusy(true, "Guardando anuncio...");

    const selectedPath = document.getElementById('community-selector').value;
    const isGlobal = (selectedPath === 'anuncios_globales');
    const key = currentAnnKey || Date.now().toString();
    
    const targetPath = isGlobal ? `anuncios_globales/${key}` : `${selectedPath}/anuncios/${key}`;

    const data = {
        id: key,
        titulo: title,
        texto: text,
        fecha: document.getElementById('ann-date-label').value.trim(),
        fechaVencimiento: document.getElementById('ann-expiry').value,
        imagenUrl: document.getElementById('ann-image-url').value.trim(),
        link: document.getElementById('ann-btn-url').value.trim(),
        linkTexto: document.getElementById('ann-btn-text').value.trim(),
        esGlobal: isGlobal
    };

    try {
        await db.ref(targetPath).set(data);
        alert("✅ Anuncio guardado con éxito.");
        newAnnouncement();
    } catch(e) { 
        alert("Error al guardar: " + e.message); 
    } finally { 
        setBusy(false); 
    }
}

// 3. ARCHIVAR Y RESTAURAR LÓGICO
function handleAnnouncementAction() {
    if (isViewingArchive) {
        restoreAnnouncement();
    } else {
        archiveAnnouncement();
    }
}

async function archiveAnnouncement() {
    if(!currentAnnKey || !confirm("⚠️ ¿Mover este anuncio al archivo? Quedará guardado por 180 días en el historial antes de su eliminación definitiva.")) return;
    
    setBusy(true, "Archivando...");
    const selectedPath = document.getElementById('community-selector').value;
    const isGlobal = (selectedPath === 'anuncios_globales');
    
    const activePath = isGlobal ? `anuncios_globales/${currentAnnKey}` : `${selectedPath}/anuncios/${currentAnnKey}`;
    const archivePath = isGlobal ? `anuncios_globales_archivados/${currentAnnKey}` : `${selectedPath}/anuncios_archivados/${currentAnnKey}`;

    try {
        const anuncioToArchive = { ...allAnnouncements[currentAnnKey] };
        anuncioToArchive.fecha_archivado = Date.now(); 

        await db.ref(archivePath).set(anuncioToArchive);
        await db.ref(activePath).remove();
        
        alert("📦 Anuncio archivado correctamente.");
        newAnnouncement();
    } catch(e) { 
        alert("Error al archivar: " + e.message); 
    } finally { 
        setBusy(false); 
    }
}

async function restoreAnnouncement() {
    if(!currentAnnKey || !confirm("♻️ ¿Restaurar este anuncio? Volverá a estar visible inmediatamente en la app.")) return;
    
    setBusy(true, "Restaurando...");
    const selectedPath = document.getElementById('community-selector').value;
    const isGlobal = (selectedPath === 'anuncios_globales');
    
    const activePath = isGlobal ? `anuncios_globales/${currentAnnKey}` : `${selectedPath}/anuncios/${currentAnnKey}`;
    const archivePath = isGlobal ? `anuncios_globales_archivados/${currentAnnKey}` : `${selectedPath}/anuncios_archivados/${currentAnnKey}`;

    try {
        const anuncioToRestore = { ...allAnnouncements[currentAnnKey] };
        delete anuncioToRestore.fecha_archivado; // Le sacamos la marca de muerte
        
        await db.ref(activePath).set(anuncioToRestore);
        await db.ref(archivePath).remove();
        
        alert("📢 Anuncio restaurado. Ya está activo nuevamente.");
        newAnnouncement();
    } catch(e) { 
        alert("Error al restaurar: " + e.message); 
    } finally { 
        setBusy(false); 
    }
}

// 4. SUBIDA DE IMÁGENES A STORAGE
async function uploadFlyer(input) {
    const file = input.files[0];
    if (!file) return;

    setBusy(true, "Subiendo Flyer...");
    try {
        const fileName = `ann_${Date.now()}_${file.name}`;
        const ref = storage.ref(`anuncios/images/${fileName}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        
        document.getElementById('ann-image-url').value = url;
        document.getElementById('flyer-preview').style.display = 'block';
        document.getElementById('ann-img-preview').src = url;
    } catch (e) { 
        alert("Error al subir: " + e.message); 
    } finally { 
        setBusy(false); 
    }
}



