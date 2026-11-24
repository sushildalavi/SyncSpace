// Preloaded into the API process during e2e runs (NODE_OPTIONS=--import=...).
// Redirects the two server-side Google endpoints to the local mock. Nothing else is touched.
const mock = process.env.MOCK_GOOGLE_URL ?? "http://localhost:3199";
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (raw.startsWith("https://oauth2.googleapis.com/token")) return realFetch(`${mock}/token`, init);
  if (raw.startsWith("https://www.googleapis.com/oauth2/v3/certs")) return realFetch(`${mock}/certs`, init);
  return realFetch(input, init);
};
