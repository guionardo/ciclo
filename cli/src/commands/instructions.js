// src/commands/instructions.js
// Exibe todas as instruções que são passadas ao agente que trabalha neste repo:
//   - AGENTS.md do projeto (incluindo a seção gerenciada pelo ciclo)
//   - AGENTS.md global do usuário (~/.hermes/AGENTS.md), se existir
//   - As skills habilitadas no ciclo (skillsEnabled) e o conteúdo do SKILL.md
//     de cada uma (procuradas em ~/.hermes/skills/ e ~/.hermes/plugins/*/skills/)
//
// Uso:
//   ciclo instrucoes            # mostra AGENTS.md (repo + global) e lista skills
//   ciclo instrucoes --texto    # inclui o conteúdo integral das skills
//   ciclo instrucoes --check    # só verifica quais arquivos/skills existem

const { Command } = require('commander');
const { access, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const os = require('node:os');

const HERMES_DIR = join(os.homedir(), '.hermes');
const SKILLS_DIRS = [
  join(HERMES_DIR, 'skills'),
];

async function fileExistsOrNull(p) {
  try {
    await access(p);
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Find a SKILL.md for a skill name, searching recursively under the Hermes
 * skills tree (skills can be nested: ~/.hermes/skills/<category>/<name>/SKILL.md)
 * and also the hermes-agent install dir.
 * @param {string} skillName
 * @returns {Promise<string|null>} path or null
 */
async function findSkillFile(skillName) {
  const { readdir: rd } = require('node:fs/promises');
  const roots = [join(HERMES_DIR, 'skills'), join(HERMES_DIR, 'hermes-agent')];
  const queue = [...roots];
  const seen = new Set();
  while (queue.length > 0) {
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);
    let entries;
    try {
      entries = await rd(dir, { withFileTypes: true });
    } catch (_) { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        // If this directory IS the skill (has SKILL.md as direct child)
        try {
          await access(join(p, 'SKILL.md'));
          if (e.name === skillName) return join(p, 'SKILL.md');
        } catch (_) { /* not a skill dir */ }
        // Descend (bounded: avoid going too deep into references/)
        if (!e.name.startsWith('.') && e.name !== 'references' && e.name !== 'node_modules') {
          queue.push(p);
        }
      }
    }
  }
  return null;
}

const instructionsCommand = new Command()
  .command('instrucoes')
  .alias('agent-instructions')
  .description('Exibe as instruções passadas ao agente (AGENTS.md + skills)')
  .option('-t, --texto', 'mostrar o conteúdo integral das skills (SKILL.md)')
  .option('-c, --check', 'apenas verificar quais arquivos e skills existem')
  .action(async (opts) => {
    const cwd = process.cwd();
    console.log('📋 Instruções para o agente\n');

    // ---------- AGENTS.md do projeto ----------
    const repoAgents = await fileExistsOrNull(join(cwd, 'AGENTS.md'));
    if (repoAgents) {
      console.log('══════════════════════════════════════════════════');
      console.log('📄 AGENTS.md (projeto)');
      console.log('══════════════════════════════════════════════════');
      // highlight the managed ciclo section
      const begin = repoAgents.indexOf('<!-- ciclo:begin -->');
      const end = repoAgents.indexOf('<!-- ciclo:end -->');
      if (begin >= 0 && end > begin) {
        const before = repoAgents.slice(0, begin).trim();
        const section = repoAgents.slice(begin, end + '<!-- ciclo:end -->'.length);
        if (before) {
          console.log(before);
          console.log('');
        }
        console.log(section);
        console.log('');
      } else {
        console.log(repoAgents);
        console.log('');
      }
    } else {
      console.log('⚠️  AGENTS.md (projeto) não encontrado. Rode `ciclo init` para criá-lo.');
      console.log('');
    }

    // ---------- AGENTS.md global do usuário ----------
    const globalAgents = await fileExistsOrNull(join(HERMES_DIR, 'AGENTS.md'));
    if (globalAgents) {
      console.log('══════════════════════════════════════════════════');
      console.log('📄 AGENTS.md (global do usuário) — ~/.hermes/AGENTS.md');
      console.log('══════════════════════════════════════════════════');
      console.log(globalAgents);
      console.log('');
    }

    // ---------- Contexto do ciclo (context/rules/*.md) ----------
    const { readdir } = require('node:fs/promises');
    try {
      const rulesDir = join(cwd, 'context', 'rules');
      const ruleFiles = (await readdir(rulesDir)).filter((f) => f.endsWith('.md'));
      if (ruleFiles.length > 0) {
        console.log('📂 Regras de contexto do ciclo:');
        for (const r of ruleFiles) {
          console.log(`   - context/rules/${r}`);
        }
        console.log('');
      }
    } catch (_) { /* no rules dir */ }

    // ---------- Skills habilitadas (do config do ciclo) ----------
    let skillsEnabled = [];
    try {
      const cfg = JSON.parse(await readFile(join(cwd, '.ciclo', 'config.json'), 'utf8'));
      skillsEnabled = cfg.skillsEnabled || [];
    } catch (_) { /* no config */ }
    // fallback: user defaults
    if (skillsEnabled.length === 0) {
      try {
        const globalCfg = JSON.parse(await readFile(join(HERMES_DIR, 'ciclo-defaults.json'), 'utf8'));
        skillsEnabled = globalCfg.skillsEnabled || [];
      } catch (_) { /* none */ }
    }

    const available = await discoverAvailableSkills(SKILLS_DIRS);

    console.log('══════════════════════════════════════════════════');
    console.log('🧠 Skills do Hermes Agent');
    console.log('══════════════════════════════════════════════════');

    if (opts.check) {
      console.log('🔎 Disponíveis em ~/.hermes/skills/:');
      available.forEach((s) => console.log(`   ${s}`));
      console.log('');
      console.log(`🔧 Habilitadas no ciclo (${skillsEnabled.length}):`);
      (skillsEnabled.length ? skillsEnabled : ['(nenhuma)']).forEach((s) => console.log(`   ${s}`));
      console.log('');
      return;
    }

    if (skillsEnabled.length === 0) {
      console.log('ℹ️  Nenhuma skill habilitada no ciclo (skillsEnabled vazio).');
      console.log('   As skills ficam em ~/.hermes/skills/<nome>/ e são ativadas via `ciclo init`.');
      console.log('');
    }

    // For each enabled skill, show its SKILL.md (name + description, full text if --texto)
    for (const skillName of skillsEnabled) {
      const skillPath = await findSkillFile(skillName);
      if (!skillPath) {
        // Maybe it's a category (contains child skills) — e.g. autonomous-ai-agents
        const categoryContent = await fileExistsOrNull(join(HERMES_DIR, 'skills', skillName, 'DESCRIPTION.md'));
        if (categoryContent !== null) {
          const { readdir } = require('node:fs/promises');
          const catDir = join(HERMES_DIR, 'skills', skillName);
          let children = [];
          try {
            const entries = await readdir(catDir, { withFileTypes: true });
            for (const c of entries) {
              if (!c.isDirectory()) continue;
              try { await access(join(catDir, c.name, 'SKILL.md')); children.push(c.name); } catch (_) {}
            }
            children.sort();
          } catch (_) {}
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📁 Categoria: ${skillName}`);
          console.log(`   → ${join(HERMES_DIR, 'skills', skillName)}`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          if (opts.texto) {
            console.log(categoryContent);
            console.log('');
          } else {
            const firstLine = categoryContent.split('\n').find((l) => l.trim());
            if (firstLine) console.log(`   ${firstLine.trim().slice(0, 160)}`);
            console.log('');
          }
          if (children.length > 0) {
            console.log(`   Skills nesta categoria: ${children.join(', ')}`);
            console.log('');
          }
          continue;
        }
        console.log(`❌ Skill "${skillName}": não encontrada em ~/.hermes/skills/ ou ~/.hermes/hermes-agent/`);
        continue;
      }
      const content = await readFile(skillPath, 'utf8');
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🧩 Skill: ${skillName}`);
      console.log(`   → ${skillPath}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      if (opts.texto) {
        console.log(content);
        console.log('');
      } else {
        // summarize: first heading + first non-empty line (description)
        const lines = content.split('\n');
        const title = lines.find((l) => l.startsWith('# ')) || skillName;
        const desc = lines.find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---')) || '';
        console.log(`   ${title.replace(/^#\s*/, '')}`);
        if (desc.trim()) console.log(`   ${desc.trim().slice(0, 160)}`);
        console.log('   (use: ciclo instrucoes --texto para o conteúdo completo)');
        console.log('');
      }
    }

    // List available skills not enabled (breadcrumb)
    const notEnabled = available.filter((s) => !skillsEnabled.includes(s));
    if (notEnabled.length > 0 && !opts.texto) {
      console.log('ℹ️  Skills disponíveis não habilitadas:');
      console.log(`   ${notEnabled.join(', ')}`);
      console.log('');
    }

    console.log('💡 Dica: as instruções aparecem ao agente na ordem: AGENTS.md global → AGENTS.md do projeto → skills habilitadas.');
  });

/**
 * Discover available skill names (dirs that contain SKILL.md) up to two levels
 * deep under the Hermes skills roots.
 * @param {string[]} roots
 * @returns {Promise<string[]>} sorted skill names
 */
async function discoverAvailableSkills(roots) {
  const { readdir } = require('node:fs/promises');
  const names = new Set();
  for (const root of roots) {
    let top;
    try {
      top = await readdir(root, { withFileTypes: true });
    } catch (_) { continue; }
    for (const e of top) {
      if (!e.isDirectory()) continue;
      const sub = join(root, e.name);
      // level 1: root/<name>/SKILL.md
      try { await access(join(sub, 'SKILL.md')); names.add(e.name); continue; } catch (_) {}
      // level 2: root/<category>/<name>/SKILL.md
      try {
        const subEntries = await readdir(sub, { withFileTypes: true });
        for (const se of subEntries) {
          if (se.isDirectory()) {
            try { await access(join(sub, se.name, 'SKILL.md')); names.add(se.name); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }
  return [...names].sort();
}

module.exports = instructionsCommand;