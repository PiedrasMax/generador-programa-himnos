// ========================
// Cargar catálogo
// ========================
let catalogo = [];
let indexByKey = new Map(); // "HR|23" -> objeto
let catalogLoaded = false;

// Estado para el Modo Maestro
const maestroState = {
  comunidad: "Los Hornos 1",
  ensayos: "",
  marcaAguaDataUrl: null,  // base64 PNG
  servicios: [],            // SD parseados
  periodo: ""               // "MM-AAAA"
};

const catalogoReady = fetch("catalogo.json")
  .then(r => r.json())
  .then(data => {
    catalogo = data || [];
    catalogo.forEach(h => {
      const key = `${(h.himnario||"").toUpperCase()}|${String(h.numero||"").toUpperCase()}`;
      indexByKey.set(key, h);
    });
    catalogLoaded = true;
  })
  .catch(err => {
    console.error("No se pudo cargar catalogo.json", err);
    catalogLoaded = false;
  });

// ========================
// Utilidades
// ========================
function findHimnosByHimnario(him) {
  return catalogo.filter(x => (x.himnario||"").toUpperCase() === (him||"").toUpperCase());
}
function findHimnosByHimnarioAndRubro(him, rubroEsperado) {
  const rub = (rubroEsperado||"").toLowerCase();
  return catalogo.filter(x =>
    (x.himnario||"").toUpperCase() === (him||"").toUpperCase() &&
    ((x.rubro||"").toLowerCase().includes(rub))
  );
}
function getHimno(him, num) {
  if (!him || !num) return null;
  const key = `${him.toUpperCase()}|${String(num).toUpperCase()}`;
  return indexByKey.get(key) || null;
}
function setBanner(msg, show=true) {
  const b = document.querySelector("#banner");
  if (!b) return;
  if (show) { b.textContent = msg; b.classList.remove("hidden"); }
  else { b.textContent = ""; b.classList.add("hidden"); }
}

// ====== BUSCADOR GLOBAL (solo copia de NÚMERO) ======
let searchIndex = []; // [{himnario, numero, nombre, rubro, temas[], keyN}]
const HORDER = { HR:0, HI:1, HC:2 };
const norm = (s) => (s||"").normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const natkey = (s) => (String(s).match(/\d+|[^\d]+/g)||[]).map(t => /^\d+$/.test(t)? Number(t): t.toLowerCase());

function buildSearchIndex() {
  searchIndex = catalogo.map(h => {
    const temasTxt = Array.isArray(h.temas) ? h.temas.join(' ') : (h.temas||'');
    const keyN = norm(`${h.himnario} ${h.numero} ${h.nombre||''} ${h.rubro||''} ${temasTxt}`);
    return { himnario: h.himnario, numero: String(h.numero),
             nombre: h.nombre||'', rubro: h.rubro||'', temas: h.temas||[], keyN };
  });
}
catalogoReady.then(buildSearchIndex);

function openSearchGlobal() {
  const p = document.getElementById('searchPanel');
  p.classList.remove('hidden');
  document.getElementById('searchInput').value = "";
  document.getElementById('searchRubro').value = "";
  document.querySelectorAll('.flt-him').forEach(cb => cb.checked = true);
  renderSearchResults([]);
  setTimeout(()=>document.getElementById('searchInput').focus(), 30);
}
function closeSearchGlobal() {
  document.getElementById('searchPanel').classList.add('hidden');
}
document.getElementById('btnSearchGlobal')?.addEventListener('click', openSearchGlobal);
document.getElementById('searchClose')?.addEventListener('click', closeSearchGlobal);
document.getElementById('searchCancel')?.addEventListener('click', closeSearchGlobal);

// Atajo "/" (en desktop) si no estás escribiendo
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    const t = (e.target.tagName||'').toLowerCase();
    if (t!=='input' && t!=='textarea' && document.getElementById('searchPanel').classList.contains('hidden')) {
      e.preventDefault(); openSearchGlobal();
    }
  } else if (e.key === 'Escape') {
    closeSearchGlobal();
  }
});

function runSearchGlobal() {
  const q   = norm(document.getElementById('searchInput').value);
  const rub = norm(document.getElementById('searchRubro').value);
  const himSet = new Set(Array.from(document.querySelectorAll('.flt-him'))
                        .filter(cb => cb.checked).map(cb => cb.value));

  if (!q && !rub) { renderSearchResults([]); return; }

  const top = [];
  for (const h of searchIndex) {
    if (!himSet.has(h.himnario)) continue;
    if (rub && !h.keyN.includes(rub)) continue;

    let s = 0;
    // exacto "HR 119"
    if (q) {
      const m = q.match(/^(hr|hi|hc)\s*([0-9A-Za-z]+)$/i);
      if (m && h.himnario===m[1].toUpperCase() && h.numero.toUpperCase()===m[2].toUpperCase()) s += 2000;

      // prefijo / subcadena en nombre
      if (h.nombre && norm(h.nombre).startsWith(q)) s += 300;
      if (h.nombre && norm(h.nombre).includes(q))  s += 180;

      // rubro / temas
      if (h.rubro && norm(h.rubro).includes(q))    s += 120;
      if (h.temas && h.temas.length && norm(h.temas.join(' ')).includes(q)) s += 80;

      // AND de tokens
      const qTokens = q.split(/\s+/).filter(Boolean);
      if (qTokens.length && qTokens.every(t => h.keyN.includes(t))) s += 100;
    }
    if (s>0 || (!q && rub)) top.push({s,h});
  }

  top.sort((a,b)=>
    b.s - a.s ||
    HORDER[a.h.himnario] - HORDER[b.h.himnario] ||
    natkey(a.h.numero).toString().localeCompare(natkey(b.h.numero).toString())
  );

  renderSearchResults(top.slice(0,60).map(x=>x.h));
}
['searchInput','searchRubro'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', runSearchGlobal);
});
document.querySelectorAll('.flt-him').forEach(cb=>cb.addEventListener('change', runSearchGlobal));

function renderSearchResults(items) {
  const box = document.getElementById('searchResults');
  if (!items.length) { box.innerHTML = '<div style="padding:8px;color:#666;">Escribí para buscar…</div>'; return; }

  box.innerHTML = items.map(h => {
    const temas = (h.temas && h.temas.length) ? ` · Temas: ${h.temas.join(', ')}` : '';
    return `
      <div class="search-item" data-num="${h.numero}">
        <div class="search-item-title">${h.himnario} ${h.numero} — ${h.nombre}</div>
        <div class="search-item-meta">${h.rubro||''}${temas}</div>
      </div>
    `;
  }).join('');

  Array.from(box.querySelectorAll('.search-item')).forEach(el=>{
    el.onclick = async ()=>{
      const num = el.dataset.num;
      try {
        await navigator.clipboard.writeText(num);
        alert(`Número copiado: ${num}`);
      } catch {
        alert(`Número: ${num}`);
      }
      closeSearchGlobal();
    };
  });
}

// ========================
// Mostrar modos
// ========================
function show(id) {
  document.querySelector("#colaborador").classList.add("hidden");
  document.querySelector("#maestro").classList.add("hidden");
  document.querySelector(id).classList.remove("hidden");
}
document.querySelector("#modoColaborador").onclick = async () => {
  await catalogoReady;
  if (!catalogLoaded) setBanner("⚠️ El catálogo no se cargó. Abrí la app desde un servidor (Live Server / http-server / SharePoint / GitHub Pages) y no con doble clic del archivo.", true);
  else setBanner("", false);
  show("#colaborador");
  document.getElementById('appGrid')?.classList.remove('two-cols');
  cargarFormularioColaborador();
};
document.querySelector("#modoMaestro").onclick = async () => {
  await catalogoReady;
  if (!catalogLoaded) setBanner("⚠️ El catálogo no se cargó. Abrí la app desde un servidor (Live Server / http-server / SharePoint / GitHub Pages).", true);
  else setBanner("", false);
  show("#maestro");
  document.getElementById('appGrid')?.classList.add('two-cols');
  cargarMaestro();
};

// ========================
// FORMULARIO COLABORADOR
// ========================
function cargarFormularioColaborador() {
  const div = document.querySelector("#colaborador");
  div.innerHTML = `
    <h2>Modo Colaborador</h2>

    <div id="listaSD"></div>

    <div class="btn-row" style="margin-top:12px; gap:8px; flex-wrap:wrap;">
      <button id="agregarSD">Agregar Servicio Divino</button>
    </div>

    <div class="btn-row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
      <button id="copiar">Copiar texto para WhatsApp</button>
    </div>

    <textarea id="salida" rows="10" style="width:100%;"></textarea>
  `;
  document.getElementById("agregarSD").onclick = agregarSD;
  document.getElementById("copiar").onclick = copiarTexto;

  agregarSD(); // primer SD por defecto
}

let sdCount = 0;

function agregarSD() {
  sdCount++;
  const cont = document.getElementById("listaSD");
  const id = `sd${sdCount}`;

  cont.insertAdjacentHTML('beforeend', `
    <details class="sd-acc" id="${id}" open>
      <summary>
        <span class="status-dot status-bad" title="Estado de campos primarios"></span>
        <span><b>Servicio Divino ${sdCount}</b> — <span class="sd-date">sin fecha</span></span>
      </summary>
      <div class="sd-body">

        <div style="margin-bottom:8px;">
          Fecha: <input type="date" class="fecha">
        </div>

        ${campoHimno("Previo 1")}
        ${campoHimno("Inicio")}
        ${campoHimno("Texto")}
        ${campoHimno("Cambio de Cargo")}
        ${campoHimno("Arrepentimiento", true)}
        ${campoHimno("Santa Cena", true)}
        ${campoHimno("Final Comunidad")}
        ${campoHimno("Final Coro")}
        ${campoHimno("Descongregación 1")}

        <details class="himno-acc">
          <summary><b>Opcionales</b></summary>
          <div class="acc-body">
            ${campoHimno("Previo 2")}
            ${campoHimno("Lectura Bíblica", true)}
            ${campoHimno("Especial 1")}
            ${campoHimno("Descongregación 2")}
          </div>
        </details>

      </div>
    </details>
  `);

  const bloque = document.getElementById(id);

  // Fecha -> actualizar cabecera
  const fecha = bloque.querySelector('.fecha');
  fecha.addEventListener('change', ()=>updateSDHeader(bloque));
  updateSDHeader(bloque);

  // Cablear pickers
  wireHimnoPickers(bloque);

  // Cada cambio en himnos -> actualizar estado
  bloque.querySelectorAll('.campo-himno .himnario, .campo-himno .numero, .campo-himno .numeroSel').forEach(el=>{
    el.addEventListener('change', ()=>updateSDHeader(bloque));
    el.addEventListener('input',  ()=>updateSDHeader(bloque));
  });
}

function campoHimno(label, conFiltro = false) {
  const filtroHtml = conFiltro ? `
    <label class="inline">
      <input type="checkbox" class="chkFiltro"> Restringir por rubro esperado
    </label>` : "";

  const baseId = label.replace(/\s+/g, "_") + "_" + Math.random().toString(36).slice(2);
  const idDatalist = `dl_${baseId}`;
  const idSelect = `sel_${baseId}`;

  // Resumen que se actualiza: "· sin seleccionar" / "HR 23 — Nombre"
  const resumen = `<span class="resumen">· sin seleccionar</span>`;

  return `
    <details class="himno-acc campo-himno" data-label="${label}">
      <summary>
        <b>${label}</b> <span class="sep">—</span> ${resumen}
      </summary>

      <div class="acc-body">
        <div class="field-toggles">
          ${filtroHtml}
          <label class="inline"><input type="checkbox" class="chkUsarLista"> Usar lista para “Número”</label>
          <label class="inline"><input type="checkbox" class="chkEstrofas"> ¿Se detallan estrofas?</label>
          <input type="text" class="estrofas hidden" placeholder="1, 2, 3" style="max-width:160px;">
        </div>

        <div>
          <label class="inline"><span>Himnario:</span>
            <select class="himnario">
              <option value="">—</option><option>HR</option><option>HI</option><option>HC</option>
            </select>
          </label>
        </div>

        <div class="mtd-escribir">
          <label class="inline"><span>Número:</span>
            <input class="numero" list="${idDatalist}" placeholder="Ej.: 119" style="min-width:120px;" />
          </label>
          <datalist id="${idDatalist}"></datalist>
        </div>

        <div class="mtd-lista hidden">
          <label class="inline"><span>Número:</span>
            <select class="numeroSel" id="${idSelect}">
              <option value="">—</option>
            </select>
          </label>
        </div>

        <div class="info">
          <span class="nombre"></span>
          <div class="meta"></div>
        </div>
      </div>
    </details>
  `;
}

function wireFechaTitulo(bloque) {
  const fecha = bloque.querySelector(".fecha");
  const titulo = bloque.querySelector(".sd-titulo");
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

  function actualizarTitulo() {
    const v = fecha.value; // "YYYY-MM-DD"
    if (!v) { titulo.textContent = ""; return; }
    const [y,m,d] = v.split("-").map(n => parseInt(n,10));
    const jsDate = new Date(y, (m-1), d);
    const dia = jsDate.getDay(); // 0=Dom ... 6=Sab
    const finDeSemana = (dia === 0 || dia === 6);
    const tipo = finDeSemana ? "Servicio Divino de Fin de Semana" : "Servicio Divino Entresemanal";
    const ddmm = `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}`;
    titulo.textContent = `${dias[dia]} ${ddmm} – ${tipo}`;
  }
  fecha.addEventListener("change", actualizarTitulo);
  actualizarTitulo();
}

function wireOpcionalesToggle(bloque) {
  const chk = bloque.querySelector(".chkEspecial");
  const cont = bloque.querySelector(".opcionales");
  function toggle() { chk.checked ? cont.classList.remove("hidden") : cont.classList.add("hidden"); }
  chk.addEventListener("change", toggle);
  toggle();
}

function wireHimnoPickers(bloque) {
  bloque.querySelectorAll(".campo-himno").forEach(campo => {
    const himSel    = campo.querySelector(".himnario");
    const numInput  = campo.querySelector(".numero");     // método escribir
    const dataList  = campo.querySelector("datalist");
    const numSel    = campo.querySelector(".numeroSel");  // método lista
    const mtdEscribir = campo.querySelector(".mtd-escribir");
    const mtdLista    = campo.querySelector(".mtd-lista");
    const chkFiltro = campo.querySelector(".chkFiltro");
    const chkUsarLista = campo.querySelector(".chkUsarLista");
    const nombre   = campo.querySelector(".nombre");
    const meta     = campo.querySelector(".meta");
    
    const chkEstrofas = campo.querySelector(".chkEstrofas");
    const inEstrofas  = campo.querySelector(".estrofas");

    function toggleEstrofas() {
    if (!inEstrofas) return;
    inEstrofas.classList.toggle("hidden", !(chkEstrofas && chkEstrofas.checked));
    }
    if (chkEstrofas) chkEstrofas.addEventListener("change", toggleEstrofas);
    toggleEstrofas();


    // Mostrar un método u otro
    function toggleMetodo() {
      const usarLista = !!(chkUsarLista && chkUsarLista.checked);
      if (usarLista) {
        mtdEscribir.classList.add("hidden");
        mtdLista.classList.remove("hidden");
        // Cuando cambie el método, refrescamos nombre en base al valor actual del select
        refrescarNombre();
      } else {
        mtdLista.classList.add("hidden");
        mtdEscribir.classList.remove("hidden");
        // Idem para el input
        refrescarNombre();
      }
    }

    // Llenar listas (datalist + select) según himnario y filtro
    function poblarListas() {
      if (dataList) dataList.innerHTML = "";
      if (numSel)   numSel.innerHTML = `<option value="">—</option>`;
      nombre.textContent = ""; meta.textContent = "";

      const him = himSel.value;
      if (!him || !catalogLoaded) return;

      const rol = (campo.dataset.label || "").toLowerCase();
      let rubroEsperado = "";
      if (chkFiltro && chkFiltro.checked) {
        if (rol.includes("santa cena"))        rubroEsperado = "santa cena";
        if (rol.includes("arrepentimiento"))   rubroEsperado = "arrepentimiento";
        if (rol.includes("lectura bíblica"))   rubroEsperado = ""; // cambiar si mañana querés filtrar
      }

      const lista = rubroEsperado
        ? findHimnosByHimnarioAndRubro(him, rubroEsperado)
        : findHimnosByHimnario(him);

      lista
        .sort((a,b) => String(a.numero).localeCompare(String(b.numero), undefined, {numeric:true}))
        .forEach(h => {
          if (dataList) {
            const opt = document.createElement("option");
            opt.value = h.numero;
            dataList.appendChild(opt);
          }
          if (numSel) {
            const opt2 = document.createElement("option");
            opt2.value = h.numero;
            opt2.textContent = h.numero;
            numSel.appendChild(opt2);
          }
        });
      actualizarResumen(campo);
    }

    // Mostrar nombre/rubro/temas según método activo
    function refrescarNombre() {
      const h  = (himSel.value||"").toUpperCase();
      const usarLista = !!(chkUsarLista && chkUsarLista.checked);
      const n  = usarLista ? (numSel.value||"").trim()
                           : (numInput.value||"").trim();
      
      const obj = getHimno(h, n);
      if (obj) {
        nombre.textContent = obj.nombre;
        const temasStr = (obj.temas && obj.temas.length) ? ` — Temas: ${obj.temas.join(", ")}` : "";
        meta.textContent = obj.rubro ? `Rubro: ${obj.rubro}${temasStr}` : (temasStr ? temasStr : "");
      } else {
        nombre.textContent = "";
        meta.textContent = "";
      }
      actualizarResumen(campo);
    }

    function actualizarResumen(campo) {
      const resumen = campo.querySelector('.resumen');
      const h = (campo.querySelector('.himnario')?.value || '').toUpperCase();
      const n = (campo.querySelector('.numero')?.value || '').trim();
      const obj = getHimno(h, n);
      if (h && n && obj) resumen.textContent = `${h} ${n} — ${obj.nombre}`;
      else if (h && n)   resumen.textContent = `${h} ${n}`;
      else resumen.textContent = '· sin seleccionar';
    }
         

    // Eventos
    if (himSel)        himSel.addEventListener("change", poblarListas);
    if (chkFiltro)     chkFiltro.addEventListener("change", poblarListas);
    if (chkUsarLista)  chkUsarLista.addEventListener("change", toggleMetodo);

    if (numInput) {
      numInput.addEventListener("input",  refrescarNombre);
      numInput.addEventListener("change", refrescarNombre);
      numInput.addEventListener("blur",   refrescarNombre);
    }
    if (numSel)   numSel.addEventListener("change", refrescarNombre);

    // Estado inicial
    toggleMetodo();
  });
}

// Campos primarios para estado
const PRIMARY_ROLES = [
  "Previo 1","Inicio","Texto","Cambio de Cargo",
  "Arrepentimiento","Santa Cena","Final Comunidad","Final Coro","Descongregación 1"
];

function isCampoCompleto(campo) {
  const h = (campo.querySelector('.himnario')?.value || '').trim();
  const n = (campo.querySelector('.numero')?.value || '').trim();
  return !!(h && n);
}

function computeSDStatus(bloque) {
  let total = 0, filled = 0;
  PRIMARY_ROLES.forEach(lbl => {
    const c = Array.from(bloque.querySelectorAll('.campo-himno')).find(x => x.dataset.label === lbl);
    if (c) { total++; if (isCampoCompleto(c)) filled++; }
  });
  return { total, filled };
}

function updateSDHeader(bloque) {
  // Fecha
  const f = bloque.querySelector('.fecha')?.value || "";
  const out = bloque.querySelector('.sd-date');
  if (out) {
    if (!f) out.textContent = "sin fecha";
    else {
      const [Y,M,D] = f.split('-'); out.textContent = `${D}/${M}`;
    }
  }
  // Estado
  const st = computeSDStatus(bloque);
  const dot = bloque.querySelector('.status-dot');
  if (dot) {
    dot.classList.remove('status-ok','status-warn','status-bad');
    if (st.filled===0) dot.classList.add('status-bad');
    else if (st.filled===st.total) dot.classList.add('status-ok');
    else dot.classList.add('status-warn');
  }
}

// ========================
// Copiar texto (Colaborador)
// ========================
function copiarTexto() {
  let salida = "";
  const bloques = document.querySelectorAll(".sd-block");

  bloques.forEach(b => {
    salida += "#SD\n";
    salida += "Fecha: " + (b.querySelector(".fecha").value || "") + "\n";

    // Orden final (incluye Lectura Bíblica)
    const orden = [
      "Previo 1",
      "Previo 2",
      "Inicio",
      "Texto",
      "Lectura Bíblica",
      "Cambio de Cargo",
      "Arrepentimiento",
      "Santa Cena",
      "Especial 1",
      "Final Comunidad",
      "Final Coro",
      "Descongregación 1",
      "Descongregación 2"
    ];

    const campos = b.querySelectorAll(".campo-himno");

    orden.forEach(lab => {
      const campo = Array.from(campos).find(x => x.dataset.label === lab);
      if (!campo) { salida += `${lab}: —\n`; return; }

      const h = (campo.querySelector(".himnario")?.value || "");
      const n = (campo.querySelector(".numero")?.value || "").trim();

      // NUEVO: estrofas
      const est = (campo.querySelector(".estrofas")?.value || "").trim();
      const estFmt = est ? " " + est.replace(/\b(\d+)\b/g, "$1ª") : ""; // 1 -> 1ª

      if (!h || !n) {
        salida += `${lab}: —\n`;
      } else {
        const obj = getHimno(h, n);
        const ref = `${h} ${n}${estFmt}`;
        if (obj) salida += `${lab}: ${ref} – ${obj.nombre}\n`;
        else     salida += `${lab}: ${ref}\n`;
      }
    });

    salida += "\n";
  });

  const out = document.querySelector("#salida");
  out.value = salida;
  navigator.clipboard.writeText(salida);
  alert("Texto copiado. Enviá tal cual al hermano encargado.");
}

// ========================
// MODO MAESTRO
// ========================
function cargarMaestro() {
  const div = document.querySelector("#maestro");
  div.innerHTML = `
    <h2>Modo Maestro</h2>

    <div class="section">
      <h3>1) Pegar textos</h3>
      <p>Pegá aquí los <b>#SD</b> que te enviaron por WhatsApp (uno debajo del otro).</p>
      <textarea id="inputMaestro" rows="10" style="width:100%;"></textarea>
      <div class="btn-row">
        <button id="procesar">Procesar</button>
      </div>
    </div>

    <div class="section">
      <h3>2) Encabezado del PDF</h3>
      <label class="block">
        Comunidad:
        <input type="text" id="pdfComunidad" value="${maestroState.comunidad}" />
      </label>
      <label class="block">
        Ensayos (se imprime siempre “Ensayos:”):
        <input type="text" id="pdfEnsayos" placeholder="Ej.: 28/02/2026 17 hs" />
      </label>
      <label class="block">
        Marca de agua PNG (opcional):
        <input type="file" id="pdfMarcaAgua" accept="image/png" />
      </label>
      <div class="small">Si no cargás PNG, no se imprimirá marca de agua.</div>
    </div>

    <div class="section">
      <h3>3) Vista rápida y Exportar</h3>
      <div class="btn-row">
        <button id="btnAgregarSD">Agregar SD</button>
        <button id="exportarPDF">Exportar PDF</button>
      </div>
      <div id="tablaResultado"></div>
      <div id="editorArea"></div>
    </div>
  `;

  // Handlers
  document.querySelector("#procesar").onclick = procesarMaestro;
  document.querySelector("#exportarPDF").onclick = exportarPDF;

    document.querySelector("#btnAgregarSD").onclick = () => {
    const roles = [
        "Previo 1","Previo 2","Inicio","Texto","Lectura Bíblica",
        "Cambio de Cargo","Arrepentimiento","Santa Cena","Especial 1",
        "Final Comunidad","Final Coro","Descongregación 1","Descongregación 2"
    ];
    const nuevo = {
        fecha: "",
        comunidad: maestroState.comunidad || "",
        himnos: roles.map(r => ({ rol: r, himnario:"", numero:"", nombre:"", estrofas:"" }))
    };
    maestroState.servicios.push(nuevo);
    renderTablaResultado();
    editSD(maestroState.servicios.length - 1); // abrir editor del recién agregado
    };

  // Inputs de encabezado
  document.querySelector("#pdfComunidad").oninput = (e)=> maestroState.comunidad = e.target.value.trim();
  document.querySelector("#pdfEnsayos").oninput   = (e)=> maestroState.ensayos   = e.target.value.trim();
  document.querySelector("#pdfMarcaAgua").onchange = leerMarcaAgua;

  // Si ya había algo parseado antes, lo muestro
  renderTablaResultado();
}

function leerMarcaAgua(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) { maestroState.marcaAguaDataUrl = null; return; }
  const fr = new FileReader();
  fr.onload = () => { maestroState.marcaAguaDataUrl = fr.result; };
  fr.readAsDataURL(file);
}

function procesarMaestro() {
  const texto = (document.querySelector("#inputMaestro").value || "").trim();
  const bloques = texto.split("#SD").filter(b => b.trim() !== "");
  maestroState.servicios = [];

  const lineToKV = (line) => {
    const [k, ...rest] = line.split(":");
    return [ (k||"").trim(), (rest.join(":")||"").trim() ];
  };

  bloques.forEach(raw => {
    const lines = raw.split("\n").map(x => x.trim()).filter(Boolean);

    const sd = {
      fecha: "", comunidad: "",
      himnos: [] // {rol, himnario, numero, nombre}
    };

    lines.forEach(line => {
      if (line.startsWith("Fecha:")) {
        sd.fecha = lineToKV(line)[1]; // "YYYY-MM-DD"
      } else if (line.startsWith("Comunidad:")) {
        sd.comunidad = lineToKV(line)[1];
      } else {
        // "Rol: —" o "Rol: HR 119 – Nombre"
        
        // Antes: /^(.*?):\s*(—|((HR|HI|HC)\s*([0-9A-Za-z]+)(\s*[–-]\s*(.*))?))$/i
        // Ahora con estrofas opcionales (ej. "HR 51 1ª, 2ª – Nombre")
        const m = line.match(
            /^(.*?):\s*(—|((HR|HI|HC)\s*([0-9A-Za-z]+)(?:\s+([0-9]+(?:ª)?(?:\s*,\s*[0-9]+(?:ª)?)*) )?(?:\s*[–-]\s*(.*))?))$/i
        );

        if (m) {
          const rol = (m[1]||"").trim();
          const vacio = (m[2]||"").trim() === "—";
          if (!vacio) {
            const him = (m[4]||"").toUpperCase();
            const num = (m[5]||"").toUpperCase();
            const estrofas = (m[6]||"").trim();   // "1ª, 2ª" si vino
            const nombreLibre = (m[7]||"").trim();
            let nombre = nombreLibre;
            const obj = getHimno(him, num);
            if (obj) { nombre = obj.nombre; }

            sd.himnos.push({
              rol,
              himnario: him,
              numero: num,
              nombre,
              estrofas
            });
          } else {
            sd.himnos.push({ rol, himnario: "", numero: "", nombre: "" });
          }
        }
      }
    });

    maestroState.servicios.push(sd);
  });

  // Periodo (MM-AAAA) desde primer SD; editable si quisieras
  maestroState.periodo = "";
  if (maestroState.servicios.length && maestroState.servicios[0].fecha) {
    const ymd = maestroState.servicios[0].fecha.split("-");
    if (ymd.length >= 2) maestroState.periodo = `${ymd[1]}-${ymd[0]}`;
  }


  // NUEVO: render con botones Editar/Borrar + editor embebido
  renderTablaResultado();
  const ed = document.querySelector("#editorArea");
  if (ed) ed.innerHTML = ""; // limpiar editor si había uno abierto
}

function renderTablaResultado() {
  let html = `<p><b>Servicios procesados:</b> ${maestroState.servicios.length} &nbsp;` +
             (maestroState.periodo ? `&mdash; <b>Período:</b> ${maestroState.periodo}` : ``) +
             `</p>`;

  maestroState.servicios.forEach((sd, i) => {
    html += `<div class="sd-block">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><b>Fecha:</b> ${sd.fecha || "—"}</div>
        <div>
          <button class="btnEditar" data-idx="${i}">Editar</button>
          <button class="btnBorrar" data-idx="${i}">Borrar</button>
        </div>
      </div>
      <ul>` +
      sd.himnos.map(h => {
        const ref = (h.himnario && h.numero) ? `${h.himnario} ${h.numero}${h.estrofas?` ${h.estrofas}`:""} – ${h.nombre||""}` : "—";
        return `<li><b>${h.rol}:</b> ${ref}</li>`;
      }).join("") +
      `</ul>
    </div>`;
  });

  const cont = document.querySelector("#tablaResultado");
  cont.innerHTML = html;

  cont.querySelectorAll(".btnEditar").forEach(b => b.onclick = e => editSD(parseInt(e.target.dataset.idx,10)));
  cont.querySelectorAll(".btnBorrar").forEach(b => b.onclick = e => {
    const idx = parseInt(e.target.dataset.idx,10);
    maestroState.servicios.splice(idx,1);
    renderTablaResultado();
    const ed = document.querySelector("#editorArea");
    if (ed) ed.innerHTML = "";
  });
}

function editSD(idx) {
  const sd = maestroState.servicios[idx];
  const roles = ["Previo 1","Previo 2","Inicio","Texto","Lectura Bíblica","Cambio de Cargo","Arrepentimiento","Santa Cena","Especial 1","Final Comunidad","Final Coro","Descongregación 1","Descongregación 2"];

  const ed = document.querySelector("#editorArea");
  ed.innerHTML = `
    <div class="section">
      <h3>Editar SD #${idx+1}</h3>
      Fecha: <input type="date" id="edFecha" value="${sd.fecha||""}"><br><br>
      ${roles.map(r => campoHimno(r, (r==="Arrepentimiento" || r==="Santa Cena" || r==="Lectura Bíblica"))).join("")}
      <div class="btn-row">
        <button id="btnGuardarSD">Guardar</button>
        <button id="btnCancelarSD">Cancelar</button>
      </div>
    </div>
  `;

  // Cablear pickers en el editor embebido
  wireHimnoPickers(ed);

  // Prefill desde sd.himnos
  roles.forEach(r => {
    const h = sd.himnos.find(x => x.rol === r) || {himnario:"",numero:"",nombre:"",estrofas:""};
    const c = Array.from(ed.querySelectorAll(".campo-himno")).find(x => x.dataset.label === r);
    if (!c) return;
    c.querySelector(".himnario").value = h.himnario || "";
    c.querySelector(".chkUsarLista").checked = false;  // método escribir
    c.querySelector(".numero").value = h.numero || "";
    c.querySelector(".nombre").textContent = h.nombre || "";

    // Estrofas
    if (h.estrofas) {
      c.querySelector(".chkEstrofas").checked = true;
      c.querySelector(".estrofas").classList.remove("hidden");
      c.querySelector(".estrofas").value = h.estrofas || "";
    }

    // Actualizar listas/nombre
    c.querySelector(".himnario").dispatchEvent(new Event("change"));
    c.querySelector(".numero").dispatchEvent(new Event("input"));
  });

  document.querySelector("#btnGuardarSD").onclick = () => {
    sd.fecha = (document.querySelector("#edFecha").value || "");
    sd.himnos = roles.map(r => {
      const c = Array.from(ed.querySelectorAll(".campo-himno")).find(x => x.dataset.label === r);
      const h = (c.querySelector(".himnario")?.value || "");
      const n = (c.querySelector(".numero")?.value || "").trim();
      const obj = getHimno(h, n);
      const est = (c.querySelector(".estrofas")?.value || "").trim();
      return {
        rol: r,
        himnario: h,
        numero: n,
        nombre: obj ? obj.nombre : "",
        estrofas: est ? est.replace(/\b(\d+)\b/g, "$1ª") : ""
      };
    });
    renderTablaResultado();
    ed.innerHTML = ""; // cerrar editor
  };

  document.querySelector("#btnCancelarSD").onclick = () => { ed.innerHTML = ""; };
}

async function exportarPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.API.autoTable) {
    alert("Falta jsPDF o AutoTable. Cargalos antes de app.js.");
    return;
  }
  const { jsPDF } = window.jspdf;

  // === A4 apaisado ===
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();

  // --- Marca de agua (opcional) ---
    // Dibujar ANTES de tabla y cabeceras, así queda por detrás
    if (maestroState.marcaAguaDataUrl) {
    try {
        // Propiedades de la imagen
        const imgProps = doc.getImageProperties(maestroState.marcaAguaDataUrl);
        const imgW = imgProps.width;
        const imgH = imgProps.height;

        // Escala: que ocupe aprox. el 60% del menor lado de la página
        const target = Math.min(PAGE_W, PAGE_H) * 0.60;
        const scale = Math.min(target / imgW, target / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;

        const x = (PAGE_W - drawW) / 2;
        const y = (PAGE_H - drawH) / 2;

        // Si el motor soporta estados gráficos, bajamos opacidad
        // (no todos los builds de jsPDF incluyen GState; por eso el try/catch)
        try {
        const gState = doc.GState ? new doc.GState({ opacity: 0.12 }) : null;
        if (gState) doc.setGState(gState);
        } catch (_) { /* no-op */ }

        doc.addImage(maestroState.marcaAguaDataUrl, "PNG", x, y, drawW, drawH, undefined, "FAST");

        // Restaurar opacidad normal si se aplicó GState
        try {
        const gState = doc.GState ? new doc.GState({ opacity: 1 }) : null;
        if (gState) doc.setGState(gState);
        } catch (_) { /* no-op */ }
    } catch (e) {
        console.warn("No se pudo agregar la marca de agua:", e);
    }
  }

  // Márgenes; top alto para cabecera
  const M = { L: 24, R: 24, T: 84, B: 32 };
  const set = (f="helvetica", s="normal", z=10) => { doc.setFont(f, s); doc.setFontSize(z); };
  const TXT = [20,20,20], GRID=[190,190,190], HEAD=[0,0,0], HTXT=[255,255,255];

  const comunidad = maestroState.comunidad || (maestroState.servicios[0]?.comunidad) || "Los Hornos 1";
  const periodo = maestroState.periodo ? maestroState.periodo.replace("-", "/") : "MM/AAAA";
  const ensayos = maestroState.ensayos || "";

  // --- Cabecera por página (como tu 02/2026) ---
  const drawHeader = () => {
    const y0 = 46;
    set("helvetica","bold",12); doc.setTextColor(...TXT);
    doc.text(comunidad, M.L, y0);                        // Izquierda
    doc.text("PROGRAMA DE HIMNOS", PAGE_W/2, y0, {align:"center"}); // Centro
    set("helvetica","normal",10);
    doc.text(periodo, PAGE_W/2, y0+14, {align:"center"});
    set("helvetica","italic",10);
    doc.text(`Ensayos: ${ensayos}`, PAGE_W - M.R, y0, {align:"right"}); // Derecha
  };

  // --- Leyenda al pie ---
  const drawFooter = () => {
    set("helvetica","normal",8); doc.setTextColor(...TXT);
    doc.text(
      "Referencias: HR: Himnario Regional – HI: Himnario Internacional – HC: Himnario de Coro (Volumen I: 1 a 264, Volumen II: 265 a 464)",
      M.L, PAGE_H - 16
    );
  };

    // --- Helpers de valores (como texto plano)
    const cellText = (sd, rol) => {
    const h = sd.himnos.find(x => x.rol.toLowerCase() === rol.toLowerCase());
    if (!h || !h.himnario || !h.numero) return "—";
    const extra = h.estrofas && h.estrofas.trim() ? ` ${h.estrofas.trim()}` : "";
    const ref   = `${h.himnario} ${h.numero}${extra}`;
    const name  = h.nombre ? ` – ${h.nombre}` : "";
    return ref + name;
    };

    const hasSecondLine = (sd) => {
        const roles = ["Previo 2","Lectura Bíblica","Especial 1","Descongregación 2"];
        return roles.some(r => {
            const h = sd.himnos.find(x => x.rol.toLowerCase() === r.toLowerCase());
            return !!(h && h.himnario && h.numero); // hay himnario+número => hay dato real
        });
    };

    const fecha = (iso) => {
    if (!iso) return "—";
    const [Y,M,D] = iso.split("-");
    return `${D}/${M}`;
    };

  // --- Cabezal (fila 1)
  const head = [[
    "Fecha","Previo 1","Inicio","Texto","Camb. Cargo","Arrepent.","Santa Cena","Final Com.","Final Coro","Descong. 1"
  ]];

  // Anchos que caben (suma ≈ ancho útil)
  // Útil ≈ 842pt - (24+24) = 794pt → 50 + 9*80 = 770 (cabe sin desbordes)
  const colStyles = {
    0: { cellWidth: 49 }, // Fecha
    1: { cellWidth: 81 }, 2: { cellWidth: 81 }, 3: { cellWidth: 81 },
    4: { cellWidth: 81 }, 5: { cellWidth: 81 }, 6: { cellWidth: 81 },
    7: { cellWidth: 81 }, 8: { cellWidth: 81 }, 9: { cellWidth: 81 }
  };

  // --- Cuerpo: dos filas por SD (R1 principal con objetos {ref,name}; R2 opcionales texto simple)
  const serviciosOrdenados = sortServiciosByFecha(maestroState.servicios);
  
  const body = [];
    serviciosOrdenados.forEach(sd => {
    // Fila 1 (principal)
    body.push([
        fecha(sd.fecha),
        cellText(sd,"Previo 1"),
        cellText(sd,"Inicio"),
        cellText(sd,"Texto"),
        cellText(sd,"Cambio de Cargo"),
        cellText(sd,"Arrepentimiento"),
        cellText(sd,"Santa Cena"),
        cellText(sd,"Final Comunidad"),
        cellText(sd,"Final Coro"),
        cellText(sd,"Descongregación 1")
    ]);

    // Fila 2 (opcionales)
    if (hasSecondLine(sd)) {
        body.push([
            "", // fecha vacía en 2ª línea
            { content: `Previo 2: ${cellText(sd,"Previo 2")}`, colSpan: 2 },
            { content: `Lect. Bíblica: ${cellText(sd,"Lectura Bíblica")}`, colSpan: 3 },
            { content: `Especial: ${cellText(sd,"Especial 1")}`, colSpan: 2 },
            { content: `Descong. 2: ${cellText(sd,"Descongregación 2")}`, colSpan: 2 }
        ]);
    }
  });

  // --- AutoTable (con negrita parcial en {ref,name} de la Fila 1) ---
  doc.autoTable({
    head,
    body,
    startY: M.T,
    margin: { top: M.T, bottom: M.B, left: M.L, right: M.R },
    tableWidth: PAGE_W - (M.L + M.R),


    // 👇 clave: evita que una fila se parta entre páginas
    rowPageBreak: 'avoid',      // ← principal
    showHead: 'everyPage',

    
    // Estilos que hacen que la fila crezca con el contenido
    styles: {
        font: "helvetica",
        fontSize: 14,
        textColor: [20,20,20],
        lineColor: [190,190,190],
        lineWidth: 0.20,
        cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
        minCellHeight: 23,
        valign: 'top',             // ⬅ alinear arriba
        overflow: 'linebreak',     // ⬅ envolver
        halign: 'left'
    },
    headStyles: { fillColor: [0,0,0], textColor: [255,255,255], fontStyle: "bold", fontSize: 10, valign: 'middle' },

    
    // 👇 Garantizamos que el cuerpo y las filas alternas NO apliquen ningún fondo
    bodyStyles: { fillColor: null },            // <— sin fondo
    alternateRowStyles: { fillColor: null },    // <— sin zebra


    // Tus anchos de columna (holgados para apaisado)
    columnStyles: {
        0: { cellWidth: 45 },      // Fecha
        1: { cellWidth: 84 }, 2: { cellWidth: 84 }, 3: { cellWidth: 84 },
        4: { cellWidth: 84 }, 5: { cellWidth: 84 }, 6: { cellWidth: 84 },
        7: { cellWidth: 84 }, 8: { cellWidth: 84 }, 9: { cellWidth: 84 }
    },
    theme: "grid",
    showHead: 'everyPage',

    
    // Fallback (por si tu build necesita setearlo por fila)
    didParseCell: (data) => {
        if (data.section === 'body') {
        data.row.pageBreak = 'avoid';  // evita cortar esa fila
        }
    },

    didDrawPage: (data) => {
        // (si dejaste watermark en páginas 2+, mantenelo aquí)
        drawHeader();
        drawFooter();
    }
  });

  doc.save(`PROGRAMA_HIMNOS_${(maestroState.periodo || "MES-AAAA")}.pdf`);
}

  function parseISODateSafe(s) {
  // Espera "YYYY-MM-DD"
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  // Construcción en UTC para evitar corrimientos por zona horaria
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Validación: que no se autocorrija a otra fecha
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime(); // timestamp
}

function sortServiciosByFecha(servicios) {
  // Deja al final los SD sin fecha válida, manteniendo su orden relativo (estable).
  return servicios
    .map((sd, idx) => ({ sd, idx, t: parseISODateSafe(sd.fecha) }))
    .sort((a, b) => {
      const at = a.t, bt = b.t;
      if (at == null && bt == null) return a.idx - b.idx;
      if (at == null) return 1;
      if (bt == null) return -1;
      if (at !== bt) return at - bt;
      return a.idx - b.idx; // estable cuando coinciden fechas
    })
    .map(x => x.sd);
}

function renderTablaResultado() {
  let html = `<p><b>Servicios procesados:</b> ${maestroState.servicios.length} &nbsp;` +
             (maestroState.periodo ? `&mdash; <b>Período:</b> ${maestroState.periodo}` : ``) +
             `</p>`;

  maestroState.servicios.forEach((sd, i) => {
    html += `<div class="sd-block">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><b>Fecha:</b> ${sd.fecha || "—"}</div>
        <div>
          <button class="btnEditar" data-idx="${i}">Editar</button>
          <button class="btnBorrar" data-idx="${i}">Borrar</button>
        </div>
      </div>
      <ul>` +
      sd.himnos.map(h => {
        const ref = (h.himnario && h.numero)
          ? `${h.himnario} ${h.numero}${h.estrofas ? ` ${h.estrofas}` : ""} – ${h.nombre || ""}`
          : "—";
        return `<li><b>${h.rol}:</b> ${ref}</li>`;
      }).join("") +
      `</ul>
    </div>`;
  });

  const cont = document.querySelector("#tablaResultado");
  cont.innerHTML = html;

  // Botones de cada SD
  cont.querySelectorAll(".btnEditar").forEach(b => b.onclick = e => editSD(parseInt(e.target.dataset.idx,10)));
  cont.querySelectorAll(".btnBorrar").forEach(b => b.onclick = e => {
    const idx = parseInt(e.target.dataset.idx,10);
    maestroState.servicios.splice(idx,1);
    renderTablaResultado();
    const ed = document.querySelector("#editorArea");
    if (ed) ed.innerHTML = "";
  });
}

function editSD(idx) {
  const sd = maestroState.servicios[idx];
  const roles = [
    "Previo 1","Previo 2","Inicio","Texto","Lectura Bíblica",
    "Cambio de Cargo","Arrepentimiento","Santa Cena","Especial 1",
    "Final Comunidad","Final Coro","Descongregación 1","Descongregación 2"
  ];

  const ed = document.querySelector("#editorArea");
  ed.innerHTML = `
    <div class="section">
      <h3>Editar SD #${idx+1}</h3>
      Fecha: <input type="date" id="edFecha" value="${sd.fecha||""}"><br><br>
      ${roles.map(r => campoHimno(r, (r==="Arrepentimiento" || r==="Santa Cena" || r==="Lectura Bíblica"))).join("")}
      <div class="btn-row">
        <button id="btnGuardarSD">Guardar</button>
        <button id="btnCancelarSD">Cancelar</button>
      </div>
    </div>
  `;

  // Cablear pickers en el editor embebido
  wireHimnoPickers(ed);

  // Prefill desde sd.himnos
  roles.forEach(r => {
    const h = sd.himnos.find(x => x.rol === r) || {himnario:"",numero:"",nombre:"",estrofas:""};
    const c = Array.from(ed.querySelectorAll(".campo-himno")).find(x => x.dataset.label === r);
    if (!c) return;
    c.querySelector(".himnario").value = h.himnario || "";
    c.querySelector(".chkUsarLista").checked = false;  // método escribir
    c.querySelector(".numero").value = h.numero || "";
    c.querySelector(".nombre").textContent = h.nombre || "";

    // Estrofas
    if (h.estrofas) {
      c.querySelector(".chkEstrofas").checked = true;
      c.querySelector(".estrofas").classList.remove("hidden");
      c.querySelector(".estrofas").value = h.estrofas || "";
    }

    // Actualizar listas/nombre
    c.querySelector(".himnario").dispatchEvent(new Event("change"));
    c.querySelector(".numero").dispatchEvent(new Event("input"));
  });

  document.querySelector("#btnGuardarSD").onclick = () => {
    sd.fecha = (document.querySelector("#edFecha").value || "");
    sd.himnos = roles.map(r => {
      const c = Array.from(ed.querySelectorAll(".campo-himno")).find(x => x.dataset.label === r);
      const h = (c.querySelector(".himnario")?.value || "");
      const n = (c.querySelector(".numero")?.value || "").trim();
      const obj = getHimno(h, n);
      const est = (c.querySelector(".estrofas")?.value || "").trim();
      return {
        rol: r,
        himnario: h,
        numero: n,
        nombre: obj ? obj.nombre : "",
        estrofas: est ? est.replace(/\b(\d+)\b/g, "$1ª") : ""
      };
    });
    renderTablaResultado();
    ed.innerHTML = ""; // cerrar editor
  };

  document.querySelector("#btnCancelarSD").onclick = () => { ed.innerHTML = ""; };

}


