#!/usr/bin/env bun

/**
 * Initialize the template with your project details.
 *
 * Usage:
 *   bun scripts/init.ts
 *   bun scripts/init.ts --name my-project --scope @myorg --org myorg --title "My Project"
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"

const ROOT = resolve(import.meta.dirname, "..")

interface ReplacementConfig {
  from: string
  description: string
}

const REPLACEMENTS: Record<string, ReplacementConfig> = {
  projectName: {
    from: "typescript-project-template",
    description: "Project name (e.g., my-awesome-sdk)"
  },
  projectScope: {
    from: "@template/",
    description: "Package scope (e.g., @myorg/)"
  },
  githubOrg: {
    from: "no-witness-labs",
    description: "GitHub org/username (e.g., myorg)"
  },
  projectTitle: {
    from: "TypeScript Project Template",
    description: "Project title (e.g., My Awesome SDK)"
  },
  copyrightHolder: {
    from: "[COPYRIGHT_HOLDER]",
    description: "Copyright holder for LICENSE (e.g., My Company Inc.)"
  },
  copyrightYear: {
    from: "[YEAR]",
    description: "Copyright year (e.g., 2026)"
  }
}

const FILE_EXTENSIONS = [".json", ".ts", ".tsx", ".mjs", ".yml", ".yaml", ".mdx", ".md"]
const IGNORE_DIRS = ["node_modules", ".git", ".source", "dist", ".turbo", ".next", ".direnv", "out"]
const IGNORE_FILES = ["pnpm-lock.yaml", "init.ts"]
const INCLUDE_FILES = ["LICENSE"] // Files without extensions to include

function getAllFiles(dir: string, files: Array<string> = []): Array<string> {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)

    if (IGNORE_DIRS.includes(entry)) continue
    if (IGNORE_FILES.includes(entry)) continue

    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      getAllFiles(fullPath, files)
    } else if (FILE_EXTENSIONS.some((ext) => entry.endsWith(ext)) || INCLUDE_FILES.includes(entry)) {
      files.push(fullPath)
    }
  }

  return files
}

function replaceInFile(filePath: string, replacements: Record<string, string>): boolean {
  let content = readFileSync(filePath, "utf-8")
  let modified = false

  for (const [key, value] of Object.entries(replacements)) {
    const config = REPLACEMENTS[key]
    if (config && content.includes(config.from)) {
      content = content.replaceAll(config.from, value)
      modified = true
    }
  }

  if (modified) {
    writeFileSync(filePath, content, "utf-8")
    return true
  }

  return false
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    const defaultHint = defaultValue ? ` (${defaultValue})` : ""
    rl.question(`${question}${defaultHint}: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || "")
    })
  })
}

interface ParsedArgs {
  projectName?: string
  projectScope?: string
  githubOrg?: string
  projectTitle?: string
  copyrightHolder?: string
  copyrightYear?: string
}

function parseArgs(args: Array<string>): ParsedArgs {
  const result: ParsedArgs = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name") result.projectName = args[++i]
    else if (args[i] === "--scope") result.projectScope = args[++i]
    else if (args[i] === "--org") result.githubOrg = args[++i]
    else if (args[i] === "--title") result.projectTitle = args[++i]
    else if (args[i] === "--copyright") result.copyrightHolder = args[++i]
    else if (args[i] === "--year") result.copyrightYear = args[++i]
  }
  return result
}

async function main(): Promise<void> {
  console.log("\n🚀 TypeScript Project Template Initializer\n")

  const args = parseArgs(process.argv.slice(2))
  const currentYear = new Date().getFullYear().toString()

  const replacements: Record<string, string> = {
    projectName: args.projectName || (await prompt("Project name", "my-project")),
    projectScope: args.projectScope || (await prompt("Package scope (include trailing /)", "@myorg/")),
    githubOrg: args.githubOrg || (await prompt("GitHub org/username", "myorg")),
    projectTitle: args.projectTitle || (await prompt("Project title", "My Project")),
    copyrightHolder: args.copyrightHolder || (await prompt("Copyright holder", "Your Name")),
    copyrightYear: args.copyrightYear || (await prompt("Copyright year", currentYear))
  }

  // Ensure scope starts with @ and ends with /
  if (!replacements.projectScope.startsWith("@")) {
    replacements.projectScope = "@" + replacements.projectScope
  }
  if (!replacements.projectScope.endsWith("/")) {
    replacements.projectScope += "/"
  }

  console.log("\n📝 Replacing placeholders...\n")

  const files = getAllFiles(ROOT)
  let modifiedCount = 0

  for (const file of files) {
    if (replaceInFile(file, replacements)) {
      const relativePath = file.replace(ROOT + "/", "")
      console.log(`  ✓ ${relativePath}`)
      modifiedCount++
    }
  }

  console.log(`\n✅ Modified ${modifiedCount} files\n`)

  console.log("Next steps:")
  console.log("  1. pnpm install")
  console.log("  2. pnpm build")
  console.log("  3. pnpm test")
  console.log("  4. git add . && git commit -m 'Initialize project'\n")
}

main().catch(console.error)
