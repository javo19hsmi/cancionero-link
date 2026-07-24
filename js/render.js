const Render = {
    // Convierte el texto crudo de Firebase ([Do], **texto**) a HTML visual (Globitos, Negritas)
    toVisual: function(rawText) {
        if (!rawText) return "";

        // 1. Escapar HTML para evitar conflictos
        let html = rawText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        
        // 2. Formato de texto nativo
        html = html.replace(/\*\*_([\s\S]*?)_\*\*/g, "<b><i>$1</i></b>");
        html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
        html = html.replace(/_([\s\S]*?)_/g, "<i>$1</i>");
        html = html.replace(/\{([\s\S]*?)\}/g, "<span style='color:#888; font-style:italic'>$1</span>");
        
        // 3. Magia: Globitos de acordes. Se convierten a spans no editables.
        html = html.replace(/\[([^\]]+)\]/g, (match, chord) => {
            return `<span class="chord-chip" contenteditable="false" data-chord="${chord}">${chord}</span>`;
        });
        
        // 4. Transformar saltos de línea a etiquetas <br>
        html = html.replace(/\n/g, "<br>");
        return html;
    },

    // Convierte el Editor Visual de vuelta a texto crudo ([Do]) para guardar en Firebase
    toRaw: function(htmlElement) {
        // Clonamos el elemento para trabajar en segundo plano sin romper la vista
        let clone = htmlElement.cloneNode(true);
        
        // 1. Reemplazar los globitos devuelta por sus corchetes originales
        clone.querySelectorAll('.chord-chip').forEach(chip => {
            chip.replaceWith(`[${chip.getAttribute('data-chord')}]`);
        });
        
        // 2. Convertir <br> y <div> (que generan los navegadores) a saltos de línea reales \n
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('div').forEach(div => {
            div.prepend('\n');
            div.replaceWith(...div.childNodes);
        });
        
        // 3. Limpiamos cualquier salto de línea doble accidental
        let rawText = clone.textContent || clone.innerText || "";
        return rawText.replace(/\n\n/g, '\n');
    }
};
