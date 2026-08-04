// Bun resolves `template.tar.gz` and `cc-ein-runtime.tar.gz` imports with
// `{ type: "file" }` to paths embedded into the binary under `bun build --compile`.
declare module "*.tar.gz" {
  const path: string;
  export default path;
}

// Bun embeds text imports into compiled installers.
declare module "*.fish" {
  const content: string;
  export default content;
}
