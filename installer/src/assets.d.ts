// Bun resolves `import x from "./file.tar.gz" with { type: "file" }` to the
// asset's path string (embedded into the binary under `bun build --compile`).
declare module "*.tar.gz" {
  const path: string;
  export default path;
}
