// src/services/updateCheck.js
// Verificação de novas versões da CLI ciclo no repositório GitHub.
//
// - Versão local: version do package.json do CLI.
// - Versão disponível: GitHub Releases (tag semântica) quando existir; sem
//   releases publicadas, compara com o version do package.json da branch main
//   (a instalação via `npm install -g guionardo/ciclo` baixa o HEAD da main).
// - Changelog: body da última release, ou (sem releases) as entradas recentes
//   de docs/ciclo/CHANGELOG-IA.md da main.
//
// Checagem automática: `scheduleAutomaticCheck()` roda no arranque da CLI com
// TTL de 24h (cache em ~/.ciclo/update-check.json) e mostra um aviso discreto
// apenas quando há versão nova. Pode ser desligada com env
// CICLO_SKIP_UPDATE_CHECK=1 (ou CI=true) e forçada com `ciclo update-check`.

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const GITHUB_API = 'https://api.github.com';
const CACHE_PATH = join(os.homedir(), '.ciclo', 'update-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 3000;

/**
 * Resolve o repositório GitHub do ciclo: env CICLO_GITHUB_REPO → remote
 * origin quando rodando dentro do repo (dev) → padrão guionardo/ciclo.
 * @returns {string} "owner/repo"
 */
function resolveRepo() {
  if (process.env.CICLO_GITHUB_REPO && process.env.CICLO_GITHUB_REPO.trim()) {
    return process.env.CICLO_GITHUB_REPO.trim().replace(/^https?:\/\/github\.com\//, '');
  }
  try {
    const { execaSync } = require('execa');
    const url = execaSync('git', ['remote', 'get-url', 'origin'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).stdout.trim();
    const m = url.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch (_) { /* not in a git repo or no origin */ }
  return 'guionardo/ciclo';
}

/**
 * Versão local do CLI (cli/package.json).
 * @returns {string}
 */
function getLocalVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

/**
 * GET na API do GitHub.
 * - Prefere `gh api <path>` (usa o token do gh → funciona com repos privados).
 * - Sem gh autenticado, cai para fetch HTTP (com GITHUB_TOKEN se houver; útil
 *   em CI). 404 → null; erros de rede → throw.
 * @param {string} path
 * @returns {Promise<any|null>}
 */
async function ghFetch(path) {
  const { execaSync } = require('execa');
  // 1) gh CLI (token no keyring — obrigatório no ciclo; cobre repos privados)
  try {
    const res = execaSync('gh', ['api', path, '--jq', '.'], {
      encoding: 'utf8',
      timeout: FETCH_TIMEOUT_MS,
      reject: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.exitCode === 0 && res.stdout && res.stdout.trim()) {
      return JSON.parse(res.stdout);
    }
    // 404 sem corpo → repo/recurso não encontrado (sem releases, etc.)
    if (res.exitCode !== 0 && /404|Not Found/i.test(res.stderr || '')) return null;
    // outro erro do gh → tenta HTTP puro abaixo
  } catch (e) {
    // gh indisponível ou erro — tenta HTTP puro
  }
  // 2) HTTP puro (token opcional)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ciclo-cli',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status} para ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`GitHub API timeout (${path})`);
    throw err;
  }
}

/**
 * Compara duas versões semânticas ("1.2.3" ou "v1.2.3").
 * @returns {number} <0 se a<b, 0 se igual, >0 se a>b
 */
function compareVersions(a, b) {
  const parse = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).map((p) => (isNaN(Number(p)) ? 0 : Number(p)));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Busca a última release do repo (null se não houver release).
 * @param {string} repo
 * @returns {Promise<{tagName: string, name: string, body: string, publishedAt: string, htmlUrl: string}|null>}
 */
async function fetchLatestRelease(repo) {
  const release = await ghFetch(`/repos/${repo}/releases/latest`);
  if (!release) return null;
  return {
    tagName: release.tag_name || '',
    name: release.name || release.tag_name || '',
    body: release.body || '',
    publishedAt: release.published_at || '',
    htmlUrl: release.html_url || '',
  };
}

/**
 * Versão do package.json da branch main do repo (para comparar quando não há
 * releases — a instalação via GitHub baixa o HEAD da main).
 * @param {string} repo
 * @returns {Promise<string|null>}
 */
async function fetchMainVersion(repo) {
  const file = await ghFetch(`/repos/${repo}/contents/package.json?ref=main`);
  if (!file || !file.content) return null;
  try {
    const pkg = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    return pkg.version || null;
  } catch (_) {
    return null;
  }
}

/**
 * Entradas recentes do CHANGELOG-IA.md da main (fallback de changelog quando
 * não há releases). Retorna as primeiras `maxLines` linhas úteis.
 * @param {string} repo
 * @param {number} maxLines
 * @returns {Promise<string>}
 */
async function fetchChangelogFromMain(repo, maxLines = 40) {
  try {
    const file = await ghFetch(`/repos/${repo}/contents/docs/ciclo/CHANGELOG-IA.md?ref=main`);
    if (!file || !file.content) return '';
    const text = Buffer.from(file.content, 'base64').toString('utf8');
    return text.split('\n').slice(0, maxLines).join('\n');
  } catch (_) {
    return '';
  }
}

/**
 * Checagem completa de atualização.
 * @param {Object} [opts]
 * @param {boolean} [opts.force] ignora o cache (período/automático)
 * @returns {Promise<{
 *   current: string,
 *   repo: string,
 *   latest: string|null,          // versão disponível (release ou main)
 *   source: 'release'|'main'|null,
 *   updateAvailable: boolean,
 *   changelog: string,
 *   releaseUrl: string|null,
 *   installCommand: string,
 * }>}
 */
async function checkForUpdates({ force = false } = {}) {
  const repo = resolveRepo();
  const current = getLocalVersion();

  // cache (automático)
  if (!force) {
    const cached = readCache();
    if (cached && cached.repo === repo) return cached;
  }

  const release = await fetchLatestRelease(repo);
  let latest = null;
  let source = null;
  let changelog = '';
  let releaseUrl = null;

  if (release && release.tagName) {
    latest = release.tagName;
    source = 'release';
    changelog = release.body || `Release ${release.tagName}`;
    releaseUrl = release.htmlUrl;
  } else {
    latest = await fetchMainVersion(repo);
    source = latest ? 'main' : null;
    changelog = await fetchChangelogFromMain(repo);
  }

  const updateAvailable =
    !!latest && !!current && compareVersions(latest, current) > 0;

  const result = {
    current,
    repo,
    latest,
    source,
    updateAvailable,
    changelog,
    releaseUrl,
    installCommand: `npm install -g ${repo}${source === 'release' ? `@${latest}` : '@main'}`,
  };
  writeCache(result);
  return result;
}

// ---------------------------------------------------------------------------
// cache (checagem periódica)
// ---------------------------------------------------------------------------

function readCache() {
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    if (Date.now() - (raw.checkedAt || 0) < CACHE_TTL_MS) {
      // Um cache com latest:null e changelog vazio indica um fetch que falhou
      // (ex.: repo privado consultado sem token) — não o cobre por 24h.
      if (raw.latest == null && !raw.changelog) return null;
      return raw;
    }
  } catch (_) { /* sem cache ou expirado */ }
  return null;
}

function writeCache(result) {
  try {
    mkdirSync(join(os.homedir(), '.ciclo'), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ ...result, checkedAt: Date.now() }, null, 2), 'utf8');
  } catch (_) { /* cache é best-effort */ }
}

/**
 * Checagem automática no arranque da CLI. Discreta: imprime um aviso só quando
 * há versão nova; respeita o TTL do cache e pode ser desligada com
 * CICLO_SKIP_UPDATE_CHECK=1 ou CI=true.
 * @returns {void}
 */
function scheduleAutomaticCheck() {
  if (process.env.CICLO_SKIP_UPDATE_CHECK === '1' || process.env.CI) return;
  checkForUpdates()
    .then((r) => {
      if (r.updateAvailable) {
        console.log('');
        console.log(`⚡ Nova versão da CLI ciclo disponível: ${r.current} → ${r.latest}`);
        console.log(`   Rode \`ciclo update-check\` para ver o changelog, ou atualize com:`);
        console.log(`   ${r.installCommand}`);
        console.log('');
      }
    })
    .catch(() => { /* silencioso — checagem nunca derruba um comando */ });
}

module.exports = {
  resolveRepo,
  getLocalVersion,
  compareVersions,
  checkForUpdates,
  scheduleAutomaticCheck,
};