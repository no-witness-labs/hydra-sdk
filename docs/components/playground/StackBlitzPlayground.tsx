"use client"

import { useEffect, useRef, useState } from "react"
import sdk, { type VM } from "@stackblitz/sdk"

export interface StackBlitzPlaygroundProps {
  initialCode?: string
  onVmReady?: (vm: VM) => void
}

const defaultCode = `import { add, subtract } from "@template/core"

// Basic arithmetic with the core package
const sum = add(2, 3)
console.log("2 + 3 =", sum)

const diff = subtract(10, 4)
console.log("10 - 4 =", diff)

// Let's try some more examples
const numbers = [1, 2, 3, 4, 5]
const total = numbers.reduce((acc, n) => add(acc, n), 0)
console.log("Sum of 1-5 =", total)
`

export function StackBlitzPlayground({ initialCode = defaultCode, onVmReady }: StackBlitzPlaygroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const vmRef = useRef<VM | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasEmbeddedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || hasEmbeddedRef.current) return

    hasEmbeddedRef.current = true
    setIsLoading(true)

    sdk
      .embedProject(
        containerRef.current,
        {
          title: "TypeScript Playground",
          description: "Interactive TypeScript playground",
          template: "node",
          files: {
            "index.ts": initialCode,
            "package.json": JSON.stringify(
              {
                name: "typescript-playground",
                version: "1.0.0",
                description: "TypeScript Playground",
                type: "module",
                main: "index.ts",
                scripts: {
                  start: "tsx index.ts"
                },
                dependencies: {
                  "@template/core": "latest"
                },
                devDependencies: {
                  "@types/node": "latest",
                  tsx: "latest",
                  typescript: "latest"
                }
              },
              null,
              2
            ),
            "tsconfig.json": JSON.stringify(
              {
                compilerOptions: {
                  target: "ES2022",
                  module: "ESNext",
                  moduleResolution: "bundler",
                  lib: ["ES2022"],
                  strict: true,
                  esModuleInterop: true,
                  skipLibCheck: true,
                  forceConsistentCasingInFileNames: true,
                  resolveJsonModule: true,
                  isolatedModules: true
                }
              },
              null,
              2
            )
          }
        },
        {
          openFile: "index.ts",
          view: "editor",
          theme: "dark",
          hideExplorer: false,
          showSidebar: true,
          terminalHeight: 50,
          height: 600
        }
      )
      .then((vm) => {
        vmRef.current = vm
        onVmReady?.(vm)
        setIsLoading(false)
      })
      .catch((error) => {
        console.error("Failed to load StackBlitz:", error)
        setError("Failed to load playground. Please refresh the page or try again later.")
        setIsLoading(false)
      })
  }, [])

  return (
    <div className="relative w-full h-full min-h-[600px]">
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-fd-background">
          <div className="text-fd-muted-foreground">Loading playground...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-fd-background">
          <div className="text-center p-4">
            <div className="text-red-500 mb-2">⚠️ {error}</div>
            <button onClick={() => window.location.reload()} className="text-sm text-fd-primary hover:underline">
              Refresh page
            </button>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full min-h-[600px]" />
    </div>
  )
}
