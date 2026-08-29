// wizard.js - utility functions for transacted writes, merging, etc.
const { access, readFile, writeFile, mkdir } = require("node:fs/promises");
const { join, dirname } = require("node:path");
const { createHash } = require("node:crypto");

/**
 * Simple in-memory backup map for transacted writes.
 * In real implementation, we'd copy files to a temp dir.
 */
const BACKUP_MAP = new Map();

async function backupFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    BACKUP_MAP.set(filePath, content);
  } catch {
    // If file doesn't exist, we still note that
    BACKUP_MAP.set(filePath, ""); // null sentinel
  }
}

async function restoreBackups() {
  for (const [filePath, originalContent] of BACKUP_MAP.entries()) {
    try {
      if (originalContent === null) {
        // File didn't exist originally
        await writeFile(filePath, "", { flag: "wx" }); // create if not exist
      } else {
        await writeFile(filePath, originalContent, { encoding: "utf8" });
      }
    } catch (err) {
      console.warn(`Failed to restore ${filePath}: ${err}`);
    }
  }
  BACKUP_MAP.clear();
}

/**
 * Write content to file atomically with backup.
 * If the write fails, the original is restored.
 */
async function writeFileAtomic(filePath, content, options) {
  await backupFile(filePath);
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content, options);
    // If we get here, clear backup for this file (success)
    BACKUP_MAP.delete(filePath);
  } catch (err) {
    // On any error, attempt to restore
    await restoreBackups();
    throw err;
  }
}

/**
 * Append content to a file (used for .gitignore).
 * Still uses transacted backup.
 */
async function appendFileAtomic(filePath, content) {
  await backupFile(filePath);
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content, { flag: "a" });
    BACKUP_MAP.delete(filePath);
  } catch (err) {
    await restoreBackups();
    throw err;
  }
}

/**
 * Merge JSON objects deeply (used for config updates).
 * Non-null values from source override target.
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key in source) {
    if (source[key] === null) {
      // explicit null means delete? we keep as is for safety
      continue;
    }
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      key in output &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

/**
 * Generate a lockfile content from fingerprint and wizard answers.
 */
function generateStateJson(fingerprint, answers) {
  const state = {
    version: "0.1.0", // We'll get from external constant, but for now hardcode or pass
    fingerprintHash: fingerprint.hash,
    initializedAt: new Date().toISOString(),
    devName: answers.devName,
    taskPrefix: answers.taskPrefix,
    services: answers.services,
  };
  return JSON.stringify(state, null, 2);
}

/**
 * Parse a .ciclo/state.json file.
 */
async function readStateJson(repoPath) {
  try {
    const content = await readFile(join(repoPath, ".ciclo", "state.json"), "utf8");
    const parsed = JSON.parse(content);
    return {
      version: parsed.version,
      fingerprintHash: parsed.fingerprintHash,
    };
  } catch {
    return null;
  }
}

/**
 * Wizard answers shape — filled after each step.
 */
/* eslint-disable no-unused-vars */
const WizardAnswers = {
  // This is just for documentation; not used at runtime.
};

/**
 * Default wizard answers (used when skipping steps).
 */
const DEFAULT_ANSWERS = {
  devName: "",
  taskPrefix: "TASK",
  services: {
    jira: { configured: false, method: null, siteUrl: null },
  },
};

module.exports = {
  backupFile,
  restoreBackups,
  writeFileAtomic,
  appendFileAtomic,
  deepMerge,
  generateStateJson,
  readStateJson,
  WizardAnswers,
  DEFAULT_ANSWERS,
};