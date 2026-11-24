// Protocol-level stand-in for Google's OAuth/OIDC endpoints, used only by the e2e suite.
// It issues real RS256-signed ID tokens, serves a JWKS, and enforces PKCE (S256), the redirect URI
// and the client credentials, so Better Auth's real callback code runs end to end.
// It does NOT prove that Google's live service accepts this app's configuration.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_GOOGLE_PORT ?? 3199);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-client-secret";
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = "mock-google-key";
const codes = new Map();

const b64url = (input) => Buffer.from(input).toString("base64url");
function signIdToken(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(claims));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}
const readBody = (req) => new Promise((resolve) => { let data = ""; req.on("data", (c) => (data += c)); req.on("end", () => resolve(data)); });
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/certs") {
      return json(res, 200, { keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }] });
    }
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    // Called by the test when it plays the part of the Google consent screen.
    if (req.method === "POST" && url.pathname === "/__test/code") {
      const input = JSON.parse(await readBody(req));
      const code = crypto.randomUUID();
      codes.set(code, { ...input, used: false });
      return json(res, 200, { code });
    }

    if (req.method === "POST" && url.pathname === "/token") {
      const form = new URLSearchParams(await readBody(req));
      const basic = req.headers.authorization?.startsWith("Basic ")
        ? Buffer.from(req.headers.authorization.slice(6), "base64").toString().split(":")
        : [form.get("client_id"), form.get("client_secret")];
      if (basic[0] !== CLIENT_ID || basic[1] !== CLIENT_SECRET) return json(res, 401, { error: "invalid_client" });
      const entry = codes.get(form.get("code") ?? "");
      if (!entry || entry.used) return json(res, 400, { error: "invalid_grant", error_description: "unknown or reused code" });
      entry.used = true;
      if (form.get("redirect_uri") !== entry.redirectUri) return json(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
      const verifier = form.get("code_verifier");
      const expected = verifier ? crypto.createHash("sha256").update(verifier).digest("base64url") : null;
      if (!entry.challenge || expected !== entry.challenge) return json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
      const now = Math.floor(Date.now() / 1000);
      const idToken = signIdToken({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        azp: CLIENT_ID,
        sub: entry.profile.sub,
        email: entry.profile.email,
        email_verified: entry.profile.emailVerified ?? true,
        name: entry.profile.name,
        picture: entry.profile.picture,
        iat: now,
        exp: now + 3600,
        ...(entry.nonce ? { nonce: entry.nonce } : {})
      });
      return json(res, 200, { access_token: `mock-access-${crypto.randomUUID()}`, expires_in: 3600, scope: entry.scope, token_type: "Bearer", id_token: idToken });
    }
    json(res, 404, { error: "not_found" });
  })
  .listen(PORT, () => console.log(`mock google listening on ${PORT}`));
