// src/commands/skills.js
// Gerencia as skills empacotadas no framework ciclo.
//\ 
// As skills que documentam/instruem o uso do ciclo vivem versionadas no repo
// do framework em <repo>/skills/<nome>/ (SKILL.md + references/ + templates/ +
// scripts/). Este comando permite:
//   ciclo skills list                  # lista as skills empacotadas no framework
//   ciclo skills install               # instala (copia) as skills em ~/.hermes/skills/
//   ciclo skills install --force       # sobrescreve versões existentes
//
// Uso típico num ambiente novo: clone do repo + npm link + `ciclo skills install`.

const { Command } = require('commander');
const { access, readdir, copyFile, mkdir, rm } = require('node:fs/promises');
const { join, basename } = require('node:path');
const os = require('node:os');

// <repo>/skills — resolve a partir deste arquivo (cli/src/commands/skills.js)
const FRAMEWORK_SKILLS_DIR = join(__dirname, '..', '..', '..', 'skills');
// destino: ~/.hermes/skills/<nome>/
const HERMES_SKILLS_DIR = join(os.homedir(), '.hermes', 'skills');
// destino: ~/.config/opencode/skills/<nome>/
const OPENCODE_SKILLS_DIR = join(os.homedir(), '.config', 'opencode', 'skills');

async function dirExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista os nomes das skills empacotadas (subdiretórios com SKILL.md).
 * @returns {Promise<string[]>}
 */
async function listBundledSkills() {
  const names = [];
  let entries;
  try {
    entries = await readdir(FRAMEWORK_SKILLS_DIR, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await dirExists(join(FRAMEWORK_SKILLS_DIR, e.name, 'SKILL.md'))) {
      names.push(e.name);
    }
  }
  return names.sort();
}

/**
 * Copia recursivamente a árvore de uma skill de <repo>/skills/<name> para o
 * diretório de skills destino.
 * @param {string} name
 * @param {string} destDir
 * @returns {Promise<{files: number, dest: string}>}
 */
async function installSkill(name, destDir) {
  const src = join(FRAMEWORK_SKILLS_DIR, name);
  const dest = join(destDir, name);
  await mkdir(dest, { recursive: true });
  let files = 0;
  const queue = [{ src, dest }];
  while (queue.length > 0) {
    const { src: s, dest: d } = queue.shift();
    const entries = await readdir(s, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue; // .git, .ciclo etc. nunca são copiados
      const sp = join(s, e.name);
      const dp = join(d, e.name);
      if (e.isDirectory()) {
        await mkdir(dp, { recursive: true });
        queue.push({ src: sp, dest: dp });
      } else {
        await copyFile(sp, dp);
        files++;
      }
    }
  }
  return { files, dest };
}

const skillsCommand = new Command('skills')
  .description('Gerencia as skills empacotadas no framework ciclo (instalar no ambiente do dev)');

skillsCommand
  .command('list')
  .description('Lista as skills empacotadas no repo do framework')
  .action(async () => {
    const names = await listBundledSkills();
    console.log(`🧠 Skills empacotadas no framework (${names.length}):`);
    if (names.length === 0) {
      console.log('   (nenhuma — rode `ciclo init` gerar ou adicione skills em skills/<nome>/SKILL.md)');
      return;
    }
    for (const n of names) {
      console.log(`   - ${n}`);
    }
    console.log(`\\n📂 Origem: ${FRAMEWORK_SKILLS_DIR}`);
    console.log(`💡 Instale no Hermes com: ciclo skills install`);
  });

skillsCommand
  .command('install')
  .description('Instala (copia) as skills do framework em ~/.hermes/skills/ e ~/.config/opencode/skills/')
  .option('-f, --force', 'sobrescreve skills já existentes no destino')
  .action(async (opts) => {
    const names = await listBundledSkills();
    if (names.length === 0) {
      console.log('❌ Nenhuma skill empacotada encontrada em skills/ — nada a instalar.');
      return;
    }
    console.log(`📦 Instalando skills do framework em ${HERMES_SKILLS_DIR} e ${OPENCODE_SKILLS_DIR}...`);
    let hermesInstalled = 0;
    let hermesSkipped = 0;
    let opencodeInstalled = 0;
    let opencodeSkipped = 0;
    for (const name of names) {
      const hermesDest = join(HERMES_SKILLS_DIR, name);
      const opencodeDest = join(OPENCODE_SKILLS_DIR, name);
      let hermesExists = false;
      let opencodeExists = false;
      try {
        await access(hermesDest);
        hermesExists = true;
      } catch {}
      try {
        await access(opencodeDest);
        opencodeExists = true;
      } catch {}
      
      if (hermesExists && !opts.force) {
        console.log(`   ⏭️  ${name}: já instalada no Hermes (use --force para sobrescrever)`);
        hermesSkipped++;
      } else {
        if (hermesExists && opts.force) {
          await rm(hermesDest, { recursive: true, force: true });
        }
        await installSkill(name, HERMES_SKILLS_DIR);
        console.log(`   ✅ ${name}: copiada para Hermes`);
        hermesInstalled++;
      }
      
      if (opencodeExists && !opts.force) {
        console.log(`   ⏭️  ${name}: já instalada no opencode (use --force para sobrescrever)`);
        opencodeSkipped++;
      } else {
        if (opencodeExists && opts.force) {
          await rm(opencodeDest, { recursive: true, force: true });
        }
        await installSkill(name, OPENCODE_SKILLS_DIR);
        console.log(`   ✅ ${name}: copiada para opencode`);
        opencodeInstalled++;
      }
    }
    console.log(`✅ Concluído: Hermes: ${hermesInstalled} instalada(s), ${hermesSkipped} pulada(s).`);
    console.log(`           opencode: ${opencodeInstalled} instalada(s), ${opencodeSkipped} pulada(s).`);
    if (hermesSkipped > 0 || opencodeSkipped > 0) {
      console.log(`   Dica: rode com --force para atualizar as versões existentes.`);
    }
  });

module.exports = skillsCommand;