// `server-only` exists to make a Next.js build fail if a server module is imported by a client
// component. It has no runtime behaviour, so under vitest it resolves to nothing.
export {};
