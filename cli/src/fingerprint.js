// fingerprint.js - detects repository characteristics
const { access, readFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const { createHash } = require("node:crypto");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// True if any regular file in the directory matches one of the extensions (lowercased)
async function dirHasExtension(cwd, extensions) {
  try {
    const entries = await readdir(cwd, { withFileTypes: true });
    return entries.some(
      (e) =>
        e.isFile() &&
        extensions.some((ext) => e.name.toLowerCase().endsWith(ext))
    );
  } catch {
    return false;
  }
}

async function fingerprintRepo(cwd) {
  const fingerprint = {
    packageName: null,
    packageManager: null,
    language: null,
    frameworks: [],
    testRunner: null,
    hasGithubWorkflows: false,
    hash: "",
  };

  // 1. Check package.json
  const packagePath = join(cwd, "package.json");
  if (await exists(packagePath)) {
    const pkg = await readJsonFile(packagePath);
    if (pkg) {
      fingerprint.packageName = pkg.name ?? null;
      // Detect package manager based on lockfile presence
      const lockFiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
      for (const lock of lockFiles) {
        if (await exists(join(cwd, lock))) {
          if (lock === "package-lock.json") fingerprint.packageManager = "npm";
          else if (lock === "yarn.lock") fingerprint.packageManager = "yarn";
          else if (lock === "pnpm-lock.yaml") fingerprint.packageManager = "pnpm";
          break;
        }
      }
      // If no lockfile, default to npm if package.json exists
      if (!fingerprint.packageManager) fingerprint.packageManager = "npm";

      // Detect language and frameworks from dependencies
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const depNames = Object.keys(deps).map((d) => d.toLowerCase());

      // Language detection
      if (depNames.includes("typescript")) {
        fingerprint.language = "typescript";
      } else if (depNames.includes("@types/node") || depNames.includes("typescript")) {
        // fallback
        fingerprint.language = "typescript";
      } else {
        fingerprint.language = "javascript";
      }

      // Framework detection
      const frameworkMap = {
        react: "react",
        vue: "vue",
        "@angular/core": "angular",
        svelte: "svelte",
        express: "express",
        fastify: "fastify",
        nest: "@nestjs/core",
        next: "next",
        nuxt: "nuxt",
      };
      for (const [dep, framework] of Object.entries(frameworkMap)) {
        if (depNames.includes(dep)) {
          fingerprint.frameworks.push(framework);
        }
      }

      // Test runner detection
      const testRunners = ["jest", "vitest", "mocha", "jasmine", "cucumber"];
      for (const tr of testRunners) {
        if (depNames.includes(tr)) {
          fingerprint.testRunner = tr;
          break;
        }
      }
    }
  }

  // 2. Non-JS stacks: .NET (sln/csproj/global.json), Go (go.mod), Python (requirements/pyproject), Rust (Cargo), PHP (composer)
  if (!fingerprint.language) {
    // .NET: solution/project files at repo root, SDK pin or NuGet config
    const dotnetHints = [
      "global.json",
      "nuget.config",
      "Directory.Build.props",
      "Directory.Package.props",
    ];
    const dotnetFound =
      (await dirHasExtension(cwd, [".sln", ".slnx", ".csproj", ".fsproj", ".vbproj"])) ||
      (await Promise.all(dotnetHints.map((h) => exists(join(cwd, h))))).some(Boolean);
    if (dotnetFound) {
      fingerprint.language = "dotnet";
      fingerprint.packageManager = "nuget";
      fingerprint.testRunner = "dotnet test";
      // Best-effort package name from the first project file at the root
      const projExts = [".csproj", ".fsproj", ".vbproj"];
      const entries = await readdir(cwd, { withFileTypes: true });
      const proj = entries.find(
        (e) => e.isFile() && projExts.some((ext) => e.name.toLowerCase().endsWith(ext))
      );
      if (proj) {
        try {
          const xml = await readFile(join(cwd, proj.name), "utf8");
          const match = xml.match(/<AssemblyName>([^<]+)<\/AssemblyName>/) ||
                        xml.match(/<RootNamespace>([^<]+)<\/RootNamespace>/);
          if (match) fingerprint.packageName = match[1].trim();
        } catch (_) { /* ignore */ }
      }
    } else if (await exists(join(cwd, "go.mod"))) {
      fingerprint.language = "go";
      fingerprint.packageManager = "gomod";
      try {
        const goMod = await readFile(goModPath, "utf8");
        const modLine = goMod.split("\n").find((l) => l.startsWith("module "));
        if (modLine) fingerprint.packageName = modLine.replace("module ", "").trim();
      } catch (_) { /* ignore */ }
      // Go test runner is built-in (`go test`)
      fingerprint.testRunner = "go test";
    } else if (await exists(join(cwd, "pyproject.toml"))) {
      fingerprint.language = "python";
      fingerprint.packageManager = "poetry";
      try {
        const py = await readFile(join(cwd, "pyproject.toml"), "utf8");
        const name = py.match(/name\s*=\s*["']([^"']+)["']/);
        if (name) fingerprint.packageName = name[1];
      } catch (_) { /* ignore */ }
    } else if (await exists(join(cwd, "requirements.txt"))) {
      fingerprint.language = "python";
      fingerprint.packageManager = "pip";
      fingerprint.packageName = null;
    } else if (await exists(join(cwd, "Cargo.toml"))) {
      fingerprint.language = "rust";
      fingerprint.packageManager = "cargo";
    } else if (await exists(join(cwd, "composer.json"))) {
      fingerprint.language = "php";
      fingerprint.packageManager = "composer";
      const composer = await readJsonFile(join(cwd, "composer.json"));
      if (composer) fingerprint.packageName = composer.name ?? null;
    }
  }

  // 3. Check for GitHub workflows
  const workflowsDir = join(cwd, ".github", "workflows");
  if (await exists(workflowsDir)) {
    fingerprint.hasGithubWorkflows = true;
  }

  // 3. Generate a simple hash based on the fingerprint (excluding hash itself)
  const hashInput = {
    packageName: fingerprint.packageName,
    packageManager: fingerprint.packageManager,
    language: fingerprint.language,
    frameworks: fingerprint.frameworks.slice().sort(),
    testRunner: fingerprint.testRunner,
    hasGithubWorkflows: fingerprint.hasGithubWorkflows,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .substring(0, 8); // first 8 chars for brevity
  fingerprint.hash = hash;

  return fingerprint;
}

module.exports = { fingerprintRepo };