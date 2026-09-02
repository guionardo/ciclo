#!/usr/bin/env node
// verify-dev-machine.js — valida se a máquina de um dev está pronta para o ciclo.
//
// Multiplataforma (Linux/macOS/Windows): usa apenas stdlib do Node
// (child_process.spawnSync com array de args — sem shell, sem dependências).
//
// Roda de qualquer diretório:
//   node verify-dev-machine.js            # checks básicos (sem exigir repo)
//   node verify-dev-machine.js [repoDir]  # + valida ciclo doctor no repo
//   node verify-dev-machine.js --ci       # modo CI: imprime tudo e sai 0 mesmo
//                                         # com pendências (valida execução/forma,
//                                         # não o ambiente da máquina)
//
// Exit code: 0 = pronto, 1 = algo faltando. Cada check imprime ✅/❌.

'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const HOME = os.homedir();
const HERMES_SKILLS = join(HOME, '.hermes', 'skills');

// Modo CI: no workflow, o runner não tem acli autenticado nem config global —
// então esse modo valida que o script RODA e produz a saída esperada nos 3 SOs
// (execução/forma), e sai com 0 independente das pendências do runner.
const CI_MODE = process.argv.includes('--ci');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  try {
    return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  } catch (err) {
    return { status: -1, stdout: '', stderr: String(err && err.message || err) };
  }
}

function check(name, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

// Registra o resultado: retorna true se ok
function record(name, ok, detail = '') {
  if (check(name, ok, detail)) {
    pass++;
  } else {
    fail++;
  }
  return ok;
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

console.log('🩺 Verificação da máquina do dev (ciclo framework)\n');
console.log(`   SO: ${process.platform} (${os.release()}) | Node: ${process.version}\n`);

// 1. Node
record('Node.js instalado', !!process.version, process.version);

// 2. ciclo CLI
const ciclo = run('ciclo', ['--version']);
record('CLI ciclo no PATH', ciclo.status === 0, (ciclo.stdout || '').trim() || (ciclo.stderr || '').trim());

// 3. acli (Jira) + autenticação
const acliBin = process.platform === 'win32' ? ['where', 'acli'] : ['which', 'acli'];
const acliFound = run(acliBin[0], [acliBin[1]]).status === 0;
record('acli (Atlassian CLI) instalada', acliFound);
if (acliFound) {
  const auth = run('acli', ['jira', 'auth', 'status']);
  record('acli autenticada no Jira', auth.status === 0);
} else {
  record('acli autenticada no Jira', false, 'acli ausente — rode `ciclo init` (instala) e `acli jira auth login --web`');
}

// 4. gh (GitHub) + autenticação
const ghFound = run('gh', ['--version']).status === 0;
record('gh (GitHub CLI) instalada', ghFound);
if (ghFound) {
  const ghAuth = run('gh', ['auth', 'status']);
  // gh auth status exit 0 = logged in (hosts com "Logged in"); exit 1 = not logged in
  const loggedIn = ghAuth.status === 0 && /Logged in to \S+ account \S+/i.test(ghAuth.stdout);
  record('gh autenticada', loggedIn);
} else {
  record('gh autenticada', false, 'gh ausente — instale (brew/apt/winget) e `gh auth login`');
}

// 5. Skills do framework instaladas no Hermes
const skillDir = join(HERMES_SKILLS, 'ciclo-framework-setup');
const skillOk = existsSync(join(skillDir, 'SKILL.md'));
record('Skills do ciclo em ~/.hermes/skills/', skillOk,
  skillOk ? 'ciclo-framework-setup presente' : 'rode `ciclo skills install`');

// 6. Config global (~/.ciclo/config.json)
const globalCfg = join(HOME, '.ciclo', 'config.json');
let devName = '';
let reposDir = '';
if (existsSync(globalCfg)) {
  try {
    const cfg = JSON.parse(readFileSync(globalCfg, 'utf8'));
    devName = cfg.devName || '';
    reposDir = cfg.reposDir || '';
  } catch (_) { /* parse error → treated below */ }
  record('Config global ~/.ciclo/config.json', true,
    `${devName ? `devName=${devName}` : 'sem devName'} | ${reposDir ? `reposDir=${reposDir}` : 'sem reposDir'}`);
  if (!devName) record('devName no config global', false, 'defina devName em ~/.ciclo/config.json');
  if (!reposDir) record('reposDir no config global', false, 'defina reposDir (raiz dos repos) em ~/.ciclo/config.json');
} else {
  record('Config global ~/.ciclo/config.json', false, 'não existe — crie com devName + reposDir ou rode `ciclo init` interativo');
}

// 7. (opcional) ciclo doctor num repo (ignora flags)
const repoArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (repoArg) {
  console.log('');
  if (existsSync(join(repoArg, '.ciclo', 'config.json'))) {
    console.log(`   📂 Validando ${repoArg} com ciclo doctor...`);
    const d = run('ciclo', ['doctor'], { cwd: repoArg });
    const ok = d.status === 0 && !/✗|❌/.test(d.stdout + d.stderr);
    record('ciclo doctor no repo', ok);
  } else {
    record(`ciclo doctor no repo (${repoArg})`, false, 'pasta não inicializada — rode `ciclo init -y`');
  }
}

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

console.log('');
const total = pass + fail;
console.log(`📊 Resultado: ${pass}/${total} checks OK${fail > 0 ? `, ${fail} pendente(s)` : ''}.`);
if (fail > 0) {
  console.log('   Verifique os ❌ acima; para o Jira é obrigatório ter acli autenticado.');
  if (CI_MODE) {
    console.log('   (modo --ci: execução validada; pendências esperadas no runner sem ambiente real)');
    process.exit(0);
  }
  process.exit(1);
}
console.log('   Máquina pronta para o ciclo! 🚀');
process.exit(0);