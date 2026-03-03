import * as fs from "node:fs"
import * as path from "node:path"

const PACKAGES_DIR = path.resolve(import.meta.dirname, "../../packages")
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../content/docs/modules")

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeDoc(srcPath: string, destPath: string, title: string) {
  let content = fs.readFileSync(srcPath, "utf-8")
  // Convert HTML class attributes to className for React/MDX compatibility
  content = content.replace(/class="/g, 'className="')
  if (!content.startsWith("---")) {
    content = `---\ntitle: "${title}"\ndescription: "API documentation for ${title}"\n---\n\n${content}`
  }
  fs.writeFileSync(destPath, content)
  console.log(`Copied ${srcPath} -> ${destPath}`)
}

function copyDocFiles(srcDir: string, outputDir: string) {
  const files = fs.readdirSync(srcDir)

  for (const file of files) {
    const srcPath = path.join(srcDir, file)
    const stat = fs.statSync(srcPath)

    if (stat.isDirectory()) {
      // Docgen pattern: a directory whose name matches a single file inside it
      // e.g. Head/Head.ts.md -> hoist as Head.mdx instead of Head/Head.mdx
      const children = fs.readdirSync(srcPath)
      const hoistMatch = children.find(
        (child) => child.replace(/\.ts\.md$/, "").replace(/\.md$/, "") === file,
      )

      if (hoistMatch) {
        const hoistSrcPath = path.join(srcPath, hoistMatch)
        const destPath = path.join(outputDir, `${file}.mdx`)
        writeDoc(hoistSrcPath, destPath, file)
      } else {
        const nestedOutputDir = path.join(outputDir, file)
        ensureDir(nestedOutputDir)
        copyDocFiles(srcPath, nestedOutputDir)
      }
    } else if (
      stat.isFile() &&
      file !== "index.md" &&
      file !== "index.mdx" &&
      (file.endsWith(".md") || file.endsWith(".mdx"))
    ) {
      const destFile = file.replace(/\.ts\.md$/, ".mdx").replace(/\.md$/, ".mdx")
      const title = destFile.replace(".mdx", "")
      writeDoc(srcPath, path.join(outputDir, destFile), title)
    }
  }
}

function copyDocsFromPackage(packageName: string) {
  const docsDir = path.join(PACKAGES_DIR, packageName, "docs")

  if (!fs.existsSync(docsDir)) {
    console.log(`No docs found for ${packageName}, skipping...`)
    return
  }

  // Use the modules subdirectory directly if it exists, so the generated
  // files land flat in the output folder without an extra "modules/" level.
  // This matches the evolution-sdk copy pattern and avoids an unwanted
  // "modules" navigation category in the docs sidebar.
  const modulesDir = path.join(docsDir, "modules")
  const srcDir = fs.existsSync(modulesDir) ? modulesDir : docsDir

  const outputDir = path.join(OUTPUT_DIR, packageName)

  // Remove stale subdirectories produced by previous docgen runs so that
  // renamed or removed modules don't linger in the site. Hand-authored .mdx
  // files at the top level of the output folder are left intact.
  if (fs.existsSync(outputDir)) {
    for (const entry of fs.readdirSync(outputDir)) {
      const entryPath = path.join(outputDir, entry)
      if (fs.statSync(entryPath).isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true })
        console.log(`Removed stale directory ${entryPath}`)
      }
    }
  }

  ensureDir(outputDir)
  copyDocFiles(srcDir, outputDir)
}

function main() {
  console.log("Copying API documentation from packages...")

  // Get all package directories
  const packages = fs.readdirSync(PACKAGES_DIR).filter((name) => {
    const packagePath = path.join(PACKAGES_DIR, name)
    return fs.statSync(packagePath).isDirectory()
  })

  for (const packageName of packages) {
    copyDocsFromPackage(packageName)
  }

  console.log("Done!")
}

main()
