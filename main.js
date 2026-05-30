import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

// ============================================================
//  MINA CONFIGURABLE v1.1.0  by PainNoMercyz
// ============================================================

const PROP_CONFIG  = "mina:config_v1";
const PROP_BLOQUES = "mina:bloques_v1";

const TAG_OWNER = "owner";
const TAG_MOD   = "minamod";
const ITEM_PICO = "mina:pico_de_la_mina";

function esAdmin(j) { return j.hasTag(TAG_OWNER) || j.hasTag(TAG_MOD); }

// ============================================================
//  CONFIG POR DEFECTO
// ============================================================
const CONFIG_DEFAULT = {
  x1: 0,  y1: 60, z1: 0,
  x2: 20, y2: 65, z2: 20,
  dimension: "minecraft:overworld",
  resetMinutos: 30,
  activo: false,
};

const BLOQUES_DEFAULT = [
  { id: "minecraft:stone",       pct: 40 },
  { id: "minecraft:coal_ore",    pct: 25 },
  { id: "minecraft:iron_ore",    pct: 20 },
  { id: "minecraft:gold_ore",    pct: 10 },
  { id: "minecraft:diamond_ore", pct:  5 },
];

// ============================================================
//  PERSISTENCIA
// ============================================================
function cargarConfig() {
  try {
    const raw = world.getDynamicProperty(PROP_CONFIG);
    if (raw && typeof raw === "string") return { ...CONFIG_DEFAULT, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...CONFIG_DEFAULT };
}
function guardarConfig() {
  try { world.setDynamicProperty(PROP_CONFIG, JSON.stringify(CONFIG)); } catch (e) {}
}
function cargarBloques() {
  try {
    const raw = world.getDynamicProperty(PROP_BLOQUES);
    if (raw && typeof raw === "string") {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return p;
    }
  } catch (e) {}
  return [...BLOQUES_DEFAULT];
}
function guardarBloques() {
  try { world.setDynamicProperty(PROP_BLOQUES, JSON.stringify(BLOQUES)); } catch (e) {}
}

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let CONFIG  = cargarConfig();
let BLOQUES = cargarBloques();

let tickInicioContador = -1;
let ticksParaReset     = CONFIG.resetMinutos * 60 * 20;
let regenerandose      = false;
let yaAvisado10s       = false;

// ============================================================
//  HELPERS
// ============================================================
function getDim(id) {
  try { return world.getDimension(id); }
  catch (e) { try { return world.getDimension("minecraft:overworld"); } catch (_) { return null; } }
}
function runCmd(dim, cmd) { try { dim.runCommand(cmd); } catch (e) {} }

function normalizarCoords() {
  return {
    x1: Math.min(CONFIG.x1, CONFIG.x2), y1: Math.min(CONFIG.y1, CONFIG.y2), z1: Math.min(CONFIG.z1, CONFIG.z2),
    x2: Math.max(CONFIG.x1, CONFIG.x2), y2: Math.max(CONFIG.y1, CONFIG.y2), z2: Math.max(CONFIG.z1, CONFIG.z2),
  };
}
function estaEnMina(pos) {
  const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();
  return pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2 && pos.z >= z1 && pos.z <= z2;
}
function getPosEscape() {
  const { x2, y2, z1, z2 } = normalizarCoords();
  return { x: x2 + 3, y: y2 + 1, z: Math.floor((z1 + z2) / 2) };
}
function ticksRestantes() {
  if (tickInicioContador < 0) return 0;
  return Math.max(0, ticksParaReset - (system.currentTick - tickInicioContador));
}
function fmtTime(ticks) {
  const s = Math.ceil(ticks / 20);
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}
function totalPct() { return BLOQUES.reduce((s, b) => s + b.pct, 0); }

// ============================================================
//  RELLENAR MINA
// ============================================================
function rellenarMina() {
  if (regenerandose) return;
  regenerandose = true;
  const dim = getDim(CONFIG.dimension);
  if (!dim) { regenerandose = false; return; }
  const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();
  const tot = BLOQUES.reduce((s, b) => s + b.pct, 0);
  if (tot === 0) { regenerandose = false; return; }
  const acumulado = [];
  let acc = 0;
  for (const b of BLOQUES) { acc += b.pct / tot; acumulado.push({ id: b.id, umbral: acc }); }
  const filas = [];
  for (let y = y1; y <= y2; y++)
    for (let z = z1; z <= z2; z++)
      for (let x = x1; x <= x2; x++) {
        const r = Math.random();
        const bloque = acumulado.find(b => r <= b.umbral) ?? acumulado[acumulado.length - 1];
        filas.push({ x, y, z, id: bloque.id });
      }
  const LOTE = 200;
  let idx = 0;
  function procesarLote() {
    const fin = Math.min(idx + LOTE, filas.length);
    for (let i = idx; i < fin; i++) {
      const { x, y, z, id } = filas[i];
      try { dim.runCommand(`setblock ${x} ${y} ${z} ${id} replace`); } catch (e) {}
    }
    idx = fin;
    if (idx < filas.length) {
      system.runTimeout(procesarLote, 1);
    } else {
      regenerandose = false;
      world.sendMessage("§a§l[Mina] §r§aLa mina ha sido regenerada. §7¡A minar!");
      runCmd(dim, "playsound random.levelup @a");
      tickInicioContador = system.currentTick;
      ticksParaReset     = CONFIG.resetMinutos * 60 * 20;
    }
  }
  system.runTimeout(procesarLote, 1);
}

// ============================================================
//  AVISO + TP
// ============================================================
function checkAvisoYTp() {
  const restantes = ticksRestantes();
  if (!yaAvisado10s && restantes <= 200 && restantes > 0) {
    yaAvisado10s = true;
    world.sendMessage("§c§l[Mina] §r§c⚠ ¡La mina se regenera en §f10 segundos§c! Saliendo a los jugadores...");
    const dim = getDim(CONFIG.dimension);
    const escape = getPosEscape();
    for (const j of world.getPlayers()) {
      if (j.dimension.id === CONFIG.dimension && estaEnMina(j.location)) {
        try { j.teleport({ x: escape.x + 0.5, y: escape.y, z: escape.z + 0.5 }, { dimension: dim }); } catch (e) {}
      }
    }
  }
  if (restantes === 0 && !regenerandose && CONFIG.activo && tickInicioContador >= 0) {
    yaAvisado10s = false;
    rellenarMina();
  }
}

// ============================================================
//  HUD
// ============================================================
function tick_hud() {
  if (!CONFIG.activo || tickInicioContador < 0) return;
  const txt = `§e[Mina] §fPróxima regeneración: §a${fmtTime(ticksRestantes())}`;
  for (const j of world.getPlayers()) {
    if (j.dimension.id === CONFIG.dimension && estaEnMina(j.location)) {
      try { j.runCommand(`title @s actionbar ${txt}`); } catch (e) {}
    }
  }
}

// ============================================================
//  LOOP
// ============================================================
system.runInterval(() => {
  if (!CONFIG.activo) return;
  tick_hud();
  checkAvisoYTp();
}, 1);

// ============================================================
//  RUPTURA DE BLOQUE
// ============================================================
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const jugador = ev.player;
  const pos     = ev.block.location;
  const dim     = ev.player.dimension;
  if (!CONFIG.activo || dim.id !== CONFIG.dimension || !estaEnMina(pos)) return;
  const itemEnMano = jugador.getComponent("equippable")?.getEquipment("Mainhand");
  const tienePico  = itemEnMano?.typeId === ITEM_PICO;
  if (tienePico) {
    const dropExtra = obtenerDropExtra(ev.brokenBlockPermutation?.type?.id ?? "");
    if (dropExtra) {
      try {
        dim.spawnItem(new ItemStack(dropExtra.id, dropExtra.cantidad), { x: pos.x+0.5, y: pos.y+1, z: pos.z+0.5 });
        jugador.sendMessage("§6[Mina] §fEl Pico de la Mina duplicó tu drop!");
      } catch (e) {}
    }
  }
  if (Math.random() < 0.01) activarLuckyBlock(jugador, pos, dim);
});

function obtenerDropExtra(id) {
  const tabla = {
    "minecraft:coal_ore":            { id: "minecraft:coal",       cantidad: 2 },
    "minecraft:deepslate_coal_ore":  { id: "minecraft:coal",       cantidad: 2 },
    "minecraft:iron_ore":            { id: "minecraft:raw_iron",   cantidad: 1 },
    "minecraft:deepslate_iron_ore":  { id: "minecraft:raw_iron",   cantidad: 1 },
    "minecraft:gold_ore":            { id: "minecraft:raw_gold",   cantidad: 1 },
    "minecraft:deepslate_gold_ore":  { id: "minecraft:raw_gold",   cantidad: 1 },
    "minecraft:diamond_ore":         { id: "minecraft:diamond",    cantidad: 1 },
    "minecraft:deepslate_diamond_ore":{ id: "minecraft:diamond",   cantidad: 1 },
    "minecraft:emerald_ore":         { id: "minecraft:emerald",    cantidad: 1 },
    "minecraft:deepslate_emerald_ore":{ id: "minecraft:emerald",   cantidad: 1 },
    "minecraft:lapis_ore":           { id: "minecraft:lapis_lazuli",cantidad: 4 },
    "minecraft:redstone_ore":        { id: "minecraft:redstone",   cantidad: 4 },
    "minecraft:copper_ore":          { id: "minecraft:raw_copper", cantidad: 2 },
  };
  return tabla[id] ?? null;
}

// ============================================================
//  LUCKY BLOCKS
// ============================================================
function activarLuckyBlock(jugador, pos, dim) {
  const roll = Math.floor(Math.random() * 3);
  if (roll === 0) luckyCofreTemporal(jugador, pos, dim);
  else if (roll === 1) luckyHaste(jugador, pos, dim);
  else luckyLluviaLingotes(jugador, pos, dim);
}
function luckyCofreTemporal(jugador, pos, dim) {
  const cx = Math.floor(pos.x), cy = Math.floor(pos.y), cz = Math.floor(pos.z);
  try {
    dim.runCommand(`setblock ${cx} ${cy} ${cz} minecraft:chest`);
    const items = ["minecraft:diamond 1","minecraft:gold_ingot 4","minecraft:iron_ingot 8","minecraft:emerald 2","minecraft:coal 16","minecraft:experience_bottle 4"];
    dim.runCommand(`give ${jugador.name} ${items[Math.floor(Math.random()*items.length)]}`);
    dim.runCommand(`playsound random.orb ${jugador.name}`);
    dim.spawnParticle("minecraft:totem_particle", { x: pos.x+0.5, y: pos.y+1, z: pos.z+0.5 });
    jugador.sendMessage("§6§l[¡LUCKY BLOCK!] §r§e✨ ¡Cofre de la suerte!");
    system.runTimeout(() => { try { dim.runCommand(`setblock ${cx} ${cy} ${cz} minecraft:air`); } catch(e){} }, 100);
  } catch (e) {}
}
function luckyHaste(jugador, pos, dim) {
  try {
    jugador.runCommand("effect @s haste 30 1 true");
    dim.runCommand(`playsound note.pling ${jugador.name}`);
    dim.spawnParticle("minecraft:basic_crit_particle", { x: pos.x+0.5, y: pos.y+1, z: pos.z+0.5 });
    jugador.sendMessage("§b§l[¡LUCKY BLOCK!] §r§b⚡ ¡Prisa Minera II por 30 segundos!");
  } catch (e) {}
}
function luckyLluviaLingotes(jugador, pos, dim) {
  try {
    jugador.sendMessage("§e§l[¡LUCKY BLOCK!] §r§e🌟 ¡Lluvia de lingotes de oro!");
    dim.runCommand(`playsound mob.wither.shoot ${jugador.name}`);
    for (let oleada = 0; oleada < 5; oleada++) {
      system.runTimeout(() => {
        for (let i = 0; i < 5; i++) {
          const rx = pos.x+(Math.random()*6-3), rz = pos.z+(Math.random()*6-3), ry = pos.y+5+Math.random()*3;
          try { dim.spawnItem(new ItemStack("minecraft:gold_ingot",1),{x:rx,y:ry,z:rz}); } catch(e){}
        }
      }, oleada * 10);
    }
  } catch (e) {}
}

// ============================================================
//  ACTIVAR / DESACTIVAR
// ============================================================
function activarMina(jugador) {
  CONFIG.activo      = true;
  tickInicioContador = system.currentTick;
  ticksParaReset     = CONFIG.resetMinutos * 60 * 20;
  yaAvisado10s       = false;
  guardarConfig();
  world.sendMessage("§a§l[Mina] §r§aSistema activado por §f" + jugador.name);
  rellenarMina();
}
function desactivarMina(jugador) {
  CONFIG.activo      = false;
  tickInicioContador = -1;
  guardarConfig();
  world.sendMessage("§c§l[Mina] §r§7Sistema desactivado por §f" + jugador.name);
}

// ============================================================
//  MENÚ PRINCIPAL
// ============================================================
async function abrirMenuPrincipal(jugador) {
  const estado   = CONFIG.activo ? "§a● ACTIVA" : "§c● INACTIVA";
  const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();
  const vol      = (x2-x1+1)*(y2-y1+1)*(z2-z1+1);
  const dimNom   = CONFIG.dimension.replace("minecraft:","");
  const resetTxt = CONFIG.activo && tickInicioContador >= 0
    ? `§7Reset en: §a${fmtTime(ticksRestantes())}`
    : "§8Sin contador activo";

  const menu = new ActionFormData()
    .title("§6§lMina Configurable §8v1.1.0")
    .body(
      `§7Estado: ${estado}\n` +
      `§7Área: §f(${x1},${y1},${z1}) §8➜ §f(${x2},${y2},${z2})\n` +
      `§7Volumen: §f${vol} bloques  §8| §7Dim: §f${dimNom}\n` +
      resetTxt
    )
    .button(CONFIG.activo ? "§c⏹  Desactivar Mina" : "§a▶  Activar Mina")
    .button("§a🔄  Regenerar Ahora")
    .button("§d🧱  Gestionar Bloques")
    .button("§b📍  Configurar Área")
    .button("§e⚙  Opciones")
    .button("§7✖  Cerrar");

  const res = await menu.show(jugador);
  if (res.canceled || res.selection === 5) return;
  switch (res.selection) {
    case 0: CONFIG.activo ? desactivarMina(jugador) : activarMina(jugador); break;
    case 1: await confirmarRegeneracion(jugador); break;
    case 2: await abrirMenuBloques(jugador); break;
    case 3: await abrirMenuArea(jugador); break;
    case 4: await abrirMenuOpciones(jugador); break;
  }
}

// ============================================================
//  MENÚ ÁREA — flujo simplificado
// ============================================================
async function abrirMenuArea(jugador) {
  const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();

  const menu = new ActionFormData()
    .title("§b§l📍 Configurar Área")
    .body(
      `§7Área actual:\n` +
      `§8Esquina 1: §f(${CONFIG.x1}, ${CONFIG.y1}, ${CONFIG.z1})\n` +
      `§8Esquina 2: §f(${CONFIG.x2}, ${CONFIG.y2}, ${CONFIG.z2})\n\n` +
      `§7Elige cómo quieres definir las coordenadas:`
    )
    .button("§a📌 Esquina 1 = Mi posición actual")
    .button("§a📌 Esquina 2 = Mi posición actual")
    .button("§e✏  Escribir coordenadas manualmente")
    .button("§b🌐  Cambiar dimensión")
    .button("§7← Volver");

  const res = await menu.show(jugador);
  if (res.canceled || res.selection === 4) { await abrirMenuPrincipal(jugador); return; }

  const pos = jugador.location;

  if (res.selection === 0) {
    CONFIG.x1 = Math.floor(pos.x);
    CONFIG.y1 = Math.floor(pos.y);
    CONFIG.z1 = Math.floor(pos.z);
    guardarConfig();
    jugador.sendMessage(`§a[Mina] §fEsquina 1 guardada: §e(${CONFIG.x1}, ${CONFIG.y1}, ${CONFIG.z1})`);
    await abrirMenuArea(jugador);
    return;
  }

  if (res.selection === 1) {
    CONFIG.x2 = Math.floor(pos.x);
    CONFIG.y2 = Math.floor(pos.y);
    CONFIG.z2 = Math.floor(pos.z);
    guardarConfig();
    jugador.sendMessage(`§a[Mina] §fEsquina 2 guardada: §e(${CONFIG.x2}, ${CONFIG.y2}, ${CONFIG.z2})`);
    await abrirMenuArea(jugador);
    return;
  }

  if (res.selection === 2) {
    // Escribir coords manualmente: un campo por esquina "X Y Z"
    const form = new ModalFormData()
      .title("§e✏ Coordenadas Manuales")
      .textField(
        "Esquina 1  (X Y Z)",
        "Ej: -50 60 -50",
        `${Math.floor(CONFIG.x1)} ${Math.floor(CONFIG.y1)} ${Math.floor(CONFIG.z1)}`
      )
      .textField(
        "Esquina 2  (X Y Z)",
        "Ej: 50 70 50",
        `${Math.floor(CONFIG.x2)} ${Math.floor(CONFIG.y2)} ${Math.floor(CONFIG.z2)}`
      );

    const r = await form.show(jugador);
    if (r.canceled) { await abrirMenuArea(jugador); return; }

    const parsarXYZ = (str) => {
      const partes = String(str).trim().split(/\s+/);
      const nums   = partes.map(p => parseInt(p));
      if (nums.length === 3 && nums.every(n => !isNaN(n))) return nums;
      return null;
    };

    const c1 = parsarXYZ(r.formValues[0]);
    const c2 = parsarXYZ(r.formValues[1]);

    if (!c1 || !c2) {
      jugador.sendMessage("§c[Mina] Formato inválido. Escribe tres números separados por espacios. Ej: -50 60 -50");
      await abrirMenuArea(jugador);
      return;
    }

    [CONFIG.x1, CONFIG.y1, CONFIG.z1] = c1;
    [CONFIG.x2, CONFIG.y2, CONFIG.z2] = c2;
    guardarConfig();
    const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();
    const vol = (x2-x1+1)*(y2-y1+1)*(z2-z1+1);
    jugador.sendMessage(`§a[Mina] §fÁrea guardada: §e(${x1},${y1},${z1}) §8➜ §e(${x2},${y2},${z2}) §7(${vol} bloques)`);
    await abrirMenuArea(jugador);
    return;
  }

  if (res.selection === 3) {
    const dims    = ["minecraft:overworld","minecraft:nether","minecraft:the_end"];
    const dimNoms = ["Overworld","Nether","The End"];
    const curr    = dims.indexOf(CONFIG.dimension);
    const form    = new ModalFormData()
      .title("§b🌐 Dimensión")
      .dropdown("Dimensión de la mina", dimNoms, curr >= 0 ? curr : 0);
    const r = await form.show(jugador);
    if (!r.canceled) {
      CONFIG.dimension = dims[r.formValues[0]] ?? "minecraft:overworld";
      guardarConfig();
      jugador.sendMessage(`§a[Mina] §fDimensión cambiada a §e${CONFIG.dimension.replace("minecraft:","")}`);
    }
    await abrirMenuArea(jugador);
  }
}

// ============================================================
//  MENÚ BLOQUES — cada bloque es un botón interactivo
// ============================================================
async function abrirMenuBloques(jugador) {
  const tot   = totalPct();
  const color = tot === 100 ? "§a" : (tot > 100 ? "§c" : "§e");
  let body    = `§7Toca un bloque para editarlo o eliminarlo.\n§7Total: ${color}${tot}%`;
  if (tot !== 100) body += `\n§c⚠ Deben sumar 100% (se normaliza al regenerar)`;

  const menu = new ActionFormData()
    .title("§d§l🧱 Gestionar Bloques")
    .body(body);

  // Un botón por bloque — muestra nombre corto + % con barra visual
  for (const b of BLOQUES) {
    const nombre = b.id.replace("minecraft:","").replace(/_/g," ");
    const barras = Math.round(b.pct / 5); // máx 20 barras para 100%
    const barra  = "§a" + "█".repeat(barras) + "§8" + "░".repeat(20 - barras);
    menu.button(`§f${nombre}\n${barra} §e${b.pct}%`);
  }

  menu.button("§a➕ Añadir bloque");
  menu.button("§b🔄 Restaurar defecto");
  menu.button("§7← Volver");

  const res = await menu.show(jugador);
  if (res.canceled) { await abrirMenuPrincipal(jugador); return; }

  const totalBotones = BLOQUES.length + 3;
  const btnAnadir    = BLOQUES.length;
  const btnRestaur   = BLOQUES.length + 1;
  const btnVolver    = BLOQUES.length + 2;

  if (res.selection === btnVolver)  { await abrirMenuPrincipal(jugador); return; }
  if (res.selection === btnAnadir)  { await abrirAnadirBloque(jugador); return; }
  if (res.selection === btnRestaur) { await confirmarRestaurarBloques(jugador); return; }

  // Tocó un bloque existente → editar o eliminar
  await abrirEditarOEliminarBloque(jugador, res.selection);
}

// ============================================================
//  EDITAR O ELIMINAR UN BLOQUE (menú intermedio)
// ============================================================
async function abrirEditarOEliminarBloque(jugador, idx) {
  const b      = BLOQUES[idx];
  const nombre = b.id.replace("minecraft:","").replace(/_/g," ");

  const menu = new ActionFormData()
    .title(`§e✏ ${nombre}`)
    .body(`§7ID: §f${b.id}\n§7Porcentaje actual: §e${b.pct}%\n\n§7¿Qué quieres hacer?`)
    .button("§e✏ Editar porcentaje")
    .button("§b✏ Editar ID del bloque")
    .button("§c🗑 Eliminar este bloque")
    .button("§7← Volver");

  const res = await menu.show(jugador);
  if (res.canceled || res.selection === 3) { await abrirMenuBloques(jugador); return; }

  if (res.selection === 0) {
    // Editar solo el %
    const form = new ModalFormData()
      .title(`§e% de ${nombre}`)
      .slider(`Porcentaje (actual: ${b.pct}%)`, 1, 100, 1, b.pct);
    const r = await form.show(jugador);
    if (!r.canceled) {
      b.pct = r.formValues[0];
      guardarBloques();
      jugador.sendMessage(`§a[Mina] §f${b.id} → §e${b.pct}%`);
    }
    await abrirMenuBloques(jugador);
    return;
  }

  if (res.selection === 1) {
    // Editar ID
    const form = new ModalFormData()
      .title(`§b✏ ID de ${nombre}`)
      .textField("Nuevo ID del bloque", "Ej: minecraft:gold_ore", b.id);
    const r = await form.show(jugador);
    if (!r.canceled) {
      const nuevoId = String(r.formValues[0]).trim().toLowerCase();
      if (nuevoId) {
        b.id = nuevoId;
        guardarBloques();
        jugador.sendMessage(`§a[Mina] §fBloque cambiado a §e${nuevoId}`);
      }
    }
    await abrirMenuBloques(jugador);
    return;
  }

  if (res.selection === 2) {
    // Eliminar
    const conf = new MessageFormData()
      .title("§c🗑 Eliminar bloque")
      .body(`§f¿Eliminar §c${b.id}§f de la mina?`)
      .button2("§c🗑 Sí, eliminar").button1("§7Cancelar");
    const r = await conf.show(jugador);
    if (!r.canceled && r.selection === 1) {
      BLOQUES.splice(idx, 1);
      guardarBloques();
      jugador.sendMessage(`§c[Mina] §f${b.id} eliminado.`);
    }
    await abrirMenuBloques(jugador);
  }
}

// ============================================================
//  AÑADIR BLOQUE
// ============================================================
async function abrirAnadirBloque(jugador) {
  // Primero elegir el ID
  const form = new ModalFormData()
    .title("§a➕ Añadir Bloque")
    .textField("ID del bloque", "Ej: minecraft:diamond_ore", "minecraft:");

  const r1 = await form.show(jugador);
  if (r1.canceled) { await abrirMenuBloques(jugador); return; }
  const id = String(r1.formValues[0]).trim().toLowerCase();
  if (!id || id === "minecraft:") {
    jugador.sendMessage("§c[Mina] ID inválido.");
    await abrirMenuBloques(jugador);
    return;
  }

  // Luego elegir el % con slider
  const resto = Math.max(1, 100 - totalPct());
  const form2 = new ModalFormData()
    .title(`§a% para ${id.replace("minecraft:","").replace(/_/g," ")}`)
    .slider(`Porcentaje (quedan ~${resto}% libres)`, 1, 100, 1, Math.min(resto, 10));

  const r2 = await form2.show(jugador);
  if (r2.canceled) { await abrirMenuBloques(jugador); return; }
  const pct = r2.formValues[0];

  const existente = BLOQUES.find(b => b.id === id);
  if (existente) {
    existente.pct = Math.min(100, existente.pct + pct);
    jugador.sendMessage(`§e[Mina] §f${id} ya existía. Porcentaje: §e${existente.pct}%`);
  } else {
    BLOQUES.push({ id, pct });
    jugador.sendMessage(`§a[Mina] §f${id} añadido con §e${pct}%`);
  }
  guardarBloques();
  await abrirMenuBloques(jugador);
}

async function confirmarRestaurarBloques(jugador) {
  const conf = new MessageFormData()
    .title("§c⚠ Restaurar Bloques")
    .body("§f¿Restaurar bloques por defecto?\n§cEsto borrará tu configuración actual.")
    .button2("§c🔄 Sí, restaurar").button1("§7Cancelar");
  const r = await conf.show(jugador);
  if (!r.canceled && r.selection === 1) {
    BLOQUES = [...BLOQUES_DEFAULT];
    guardarBloques();
    jugador.sendMessage("§a[Mina] §fBloques restaurados.");
  }
  await abrirMenuBloques(jugador);
}

// ============================================================
//  MENÚ OPCIONES (antes estaba todo en el menú principal)
// ============================================================
async function abrirMenuOpciones(jugador) {
  const segsR  = Math.ceil(ticksRestantes() / 20);
  const menu   = new ActionFormData()
    .title("§e§l⚙ Opciones de la Mina")
    .body(
      `§7Reset automático: §f${CONFIG.resetMinutos} min\n` +
      `§7Próximo reset: §f${fmtTime(ticksRestantes())}\n` +
      `§7Dimensión: §f${CONFIG.dimension.replace("minecraft:","")}`
    )
    .button("§e⏱ Cambiar temporizador")
    .button("§f📊 Ver estado completo")
    .button("§6🪓 Darme el Pico Especial")
    .button("§7← Volver");

  const res = await menu.show(jugador);
  if (res.canceled || res.selection === 3) { await abrirMenuPrincipal(jugador); return; }

  if (res.selection === 0) {
    const form = new ModalFormData()
      .title("§e⏱ Temporizador")
      .slider("Minutos entre resets", 1, 120, 1, CONFIG.resetMinutos);
    const r = await form.show(jugador);
    if (!r.canceled) {
      const mins        = Math.max(1, Math.min(120, r.formValues[0]));
      CONFIG.resetMinutos = mins;
      ticksParaReset    = mins * 60 * 20;
      if (CONFIG.activo && tickInicioContador >= 0) { tickInicioContador = system.currentTick; yaAvisado10s = false; }
      guardarConfig();
      jugador.sendMessage(`§a[Mina] §fTemporizador: §e${mins} min`);
    }
    await abrirMenuOpciones(jugador);
    return;
  }

  if (res.selection === 1) {
    mostrarEstado(jugador);
    await abrirMenuOpciones(jugador);
    return;
  }

  if (res.selection === 2) {
    try {
      const pico = new ItemStack(ITEM_PICO, 1);
      jugador.getComponent("inventory").container.addItem(pico);
      jugador.sendMessage("§a[Mina] §fPico de la Mina añadido a tu inventario.");
    } catch (e) {
      jugador.sendMessage("§c[Mina] Error al dar el pico: " + e);
    }
    await abrirMenuOpciones(jugador);
  }
}

// ============================================================
//  CONFIRMAR REGENERACIÓN
// ============================================================
async function confirmarRegeneracion(jugador) {
  const conf = new MessageFormData()
    .title("§a🔄 Regenerar Ahora")
    .body("§f¿Regenerar la mina inmediatamente?\n§7Los jugadores dentro serán teleportados fuera.")
    .button2("§a✅ Sí, regenerar").button1("§7Cancelar");
  const r = await conf.show(jugador);
  if (!r.canceled && r.selection === 1) {
    const dim = getDim(CONFIG.dimension);
    const escape = getPosEscape();
    for (const j of world.getPlayers()) {
      if (j.dimension.id === CONFIG.dimension && estaEnMina(j.location)) {
        try { j.teleport({ x: escape.x+0.5, y: escape.y, z: escape.z+0.5 }, { dimension: dim }); } catch(e){}
      }
    }
    yaAvisado10s = false;
    rellenarMina();
    world.sendMessage("§a§l[Mina] §r§aRegeneración manual por §f" + jugador.name);
  }
}

// ============================================================
//  ESTADO DETALLADO
// ============================================================
function mostrarEstado(jugador) {
  const { x1, y1, z1, x2, y2, z2 } = normalizarCoords();
  const vol  = (x2-x1+1)*(y2-y1+1)*(z2-z1+1);
  const tot  = totalPct();
  let txt = "§6§l[MINA] §r§8Estado\n§8────────────────────────\n" +
    `§7Estado: ${CONFIG.activo ? "§a🟢 Activa" : "§c🔴 Inactiva"}\n` +
    `§7Área: §f(${x1},${y1},${z1}) §8➜ §f(${x2},${y2},${z2})\n` +
    `§7Volumen: §f${vol} bloques\n` +
    `§7Dimensión: §f${CONFIG.dimension.replace("minecraft:","")}\n` +
    `§7Reset cada: §f${CONFIG.resetMinutos} min\n` +
    `§7Próximo reset: §e${fmtTime(ticksRestantes())}\n` +
    `§8────────────────────────\n§7Bloques (total §e${tot}%§7):\n`;
  for (const b of BLOQUES) txt += `§8• §f${b.id} §7— §e${b.pct}%\n`;
  jugador.sendMessage(txt);
}

// ============================================================
//  ITEM USE — palo + tag owner abre el menú
// ============================================================
world.afterEvents.itemUse.subscribe((ev) => {
  const jugador = ev.source;
  const item    = ev.itemStack;
  if (!item) return;
  if (!jugador.hasTag(TAG_OWNER)) return;
  if (item.typeId !== "minecraft:stick") return;
  system.run(() => abrirMenuPrincipal(jugador));
});

// ============================================================
//  INIT
// ============================================================
system.run(() => {
  world.sendMessage(
    "§6§l[Mina Configurable v1.1.0] §r§7by §bPainNoMercyz §r§7— §aListo!\n" +
    "§7Menú: §eClic derecho con PALO §7(tag §f\"owner\"§7)"
  );
  if (CONFIG.activo) {
    tickInicioContador = system.currentTick;
    ticksParaReset     = CONFIG.resetMinutos * 60 * 20;
    world.sendMessage("§e[Mina] §fEstado restaurado. Reset en §e" + CONFIG.resetMinutos + " min§f.");
  }
});
