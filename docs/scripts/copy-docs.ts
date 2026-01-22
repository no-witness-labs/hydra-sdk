import * as fs from "node:fs"
import * as path from "node:path"

const PACKAGES_DIR = path.resolve(import.meta.dirname, "../../packages")
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../content/docs/modules")

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyDocsFromPackage(packageName: string) {
  const docsDir = path.join(PACKAGES_DIR, packageName, "docs")

  if (!fs.existsSync(docsDir)) {
    console.log(`No docs found for ${packageName}, skipping...`)
    return
  }

  const outputDir = path.join(OUTPUT_DIR, packageName)
  ensureDir(outputDir)

  const files = fs.readdirSync(docsDir)

  for (const file of files) {
    const srcPath = path.join(docsDir, file)
    const stat = fs.statSync(srcPath)

    if (stat.isFile() && (file.endsWith(".md") || file.endsWith(".mdx"))) {
      let content = fs.readFileSync(srcPath, "utf-8")

      // Convert .ts.md to .mdx if needed
      let destFile = file.replace(/\.ts\.md$/, ".mdx").replace(/\.md$/, ".mdx")
      const destPath = path.join(outputDir, destFile)

      // Add frontmatter if missing
      if (!content.startsWith("---")) {
        const title = destFile.replace(".mdx", "")
        content = `---\ntitle: "${title}"\ndescription: "API documentation for ${title}"\n---\n\n${content}`
      }

      fs.writeFileSync(destPath, content)
      console.log(`Copied ${srcPath} -> ${destPath}`)
    }
  }
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
