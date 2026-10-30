module.exports = [
(()=>{"use strict";return[
"[project]/src/app/auth/callback/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
/**
 * GET /auth/callback — the only place a Supabase identity becomes an app session.
 *
 * Flow: Google → Supabase → here (with `?code=`). We exchange the code, take the
 * verified email, find-or-create the Prisma user, and set *our* signed session
 * cookie. From this point the request is indistinguishable from a password login.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-crypto.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/config.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/server.ts [app-route] (ecmascript)");
;
;
;
;
;
;
const dynamic = "force-dynamic";
function backToAuth(message) {
    const target = new URL("/auth", (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["authBaseUrl"])());
    target.searchParams.set("error", message);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(target);
}
async function GET(request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const providerError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
    if (code === null || code.length === 0) {
        return backToAuth(providerError ?? "Google sign-in was cancelled before it finished.");
    }
    let supabase;
    try {
        supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createSupabaseServerClient"])();
    } catch (error) {
        return backToAuth(error instanceof Error ? error.message : "Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const email = data.user?.email?.trim().toLowerCase();
    if (error || email === undefined || email.length === 0) {
        return backToAuth(error?.message ?? "Google did not return an email address.");
    }
    const metadata = data.user?.user_metadata ?? {};
    const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
    const googleId = data.user?.id ?? null;
    // An email that already has a password account keeps that password: this is a
    // second way in to the same user, not a replacement for it.
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].user.upsert({
        where: {
            email
        },
        create: {
            email,
            name: fullName.length > 0 ? fullName : null,
            googleId
        },
        update: {
            googleId
        }
    });
    const response = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["postAuthPath"])(user.id), (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["authBaseUrl"])()));
    response.cookies.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SESSION_COOKIE"], (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["signSessionToken"])(user.id), (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sessionCookieOptions"])());
    return response;
}
}),
"[project]/src/lib/auth-crypto.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SESSION_COOKIE",
    ()=>SESSION_COOKIE,
    "SESSION_MAX_AGE_SECONDS",
    ()=>SESSION_MAX_AGE_SECONDS,
    "hashPassword",
    ()=>hashPassword,
    "sessionCookieOptions",
    ()=>sessionCookieOptions,
    "signSessionToken",
    ()=>signSessionToken,
    "verifyPassword",
    ()=>verifyPassword,
    "verifySessionToken",
    ()=>verifySessionToken
]);
/**
 * Session and password primitives. Pure Node crypto, no Next.js, no database —
 * so the seed script and `node --test` can use the exact same code the server uses.
 */ var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
const SESSION_COOKIE = "as_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MIN_SECRET_LENGTH = 16;
const SCRYPT_KEY_LENGTH = 64;
let ephemeralSecret = null;
/**
 * The signing key. Production refuses to boot without one; development falls
 * back to an in-memory secret (and says so) so a fresh clone still runs.
 */ function signingSecret() {
    const configured = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
    if (configured.length >= MIN_SECRET_LENGTH) return Buffer.from(configured, "utf8");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if (ephemeralSecret === null) {
        ephemeralSecret = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomBytes"])(32);
        console.warn("[auth] AUTH_SECRET is unset — using an ephemeral development secret. Sessions reset on restart.");
    }
    return ephemeralSecret;
}
function sign(payload) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHmac"])("sha256", signingSecret()).update(payload).digest("base64url");
}
function signSessionToken(userId, now = Date.now()) {
    const payload = {
        sub: userId,
        exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${sign(encoded)}`;
}
function verifySessionToken(token, now = Date.now()) {
    if (typeof token !== "string") return null;
    const separator = token.lastIndexOf(".");
    if (separator <= 0) return null;
    const encoded = token.slice(0, separator);
    const provided = token.slice(separator + 1);
    const expected = sign(encoded);
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) return null;
    if (!(0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["timingSafeEqual"])(providedBuffer, expectedBuffer)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
        if (parsed.exp * 1000 <= now) return null;
        return {
            sub: parsed.sub,
            exp: parsed.exp
        };
    } catch  {
        return null;
    }
}
function hashPassword(password) {
    const salt = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomBytes"])(16);
    const derived = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["scryptSync"])(password, salt, SCRYPT_KEY_LENGTH);
    return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}
function verifyPassword(password, stored) {
    if (typeof stored !== "string" || stored.length === 0) return false;
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    try {
        const expected = Buffer.from(hashHex, "hex");
        const derived = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["scryptSync"])(password, Buffer.from(saltHex, "hex"), expected.length);
        return derived.length === expected.length && (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["timingSafeEqual"])(derived, expected);
    } catch  {
        return false;
    }
}
function sessionCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: ("TURBOPACK compile-time value", "development") === "production",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS
    };
}
}),
"[project]/src/lib/auth.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "endSession",
    ()=>endSession,
    "getCurrentUser",
    ()=>getCurrentUser,
    "getSession",
    ()=>getSession,
    "postAuthPath",
    ()=>postAuthPath,
    "startSession",
    ()=>startSession
]);
/**
 * Server-side session helpers. Everything that needs a request context (cookies)
 * or the database lives here; the crypto primitives live in `auth-crypto.ts`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-crypto.ts [app-route] (ecmascript)");
;
;
;
;
async function startSession(userId) {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SESSION_COOKIE"], (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["signSessionToken"])(userId), (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sessionCookieOptions"])());
}
async function endSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SESSION_COOKIE"], "", {
        ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sessionCookieOptions"])(),
        maxAge: 0
    });
}
async function getSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["verifySessionToken"])(store.get(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["SESSION_COOKIE"])?.value);
}
async function getCurrentUser() {
    const session = await getSession();
    if (!session) return null;
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].user.findUnique({
        where: {
            id: session.sub
        },
        select: {
            id: true,
            email: true,
            name: true
        }
    });
}
async function postAuthPath(userId) {
    const count = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].business.count({
        where: {
            ownerId: userId
        }
    });
    return count === 0 ? "/onboarding" : "/dashboard";
}
}),
"[project]/src/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
;
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
    log: ("TURBOPACK compile-time truthy", 1) ? [
        "warn",
        "error"
    ] : "TURBOPACK unreachable"
});
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = prisma;
}),
"[project]/src/lib/supabase/config.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Supabase configuration, read once and validated.
 *
 * Supabase is only the **Google OAuth broker** here: it proves who the person is,
 * then `app/auth/callback` maps that verified email onto a Prisma user and starts
 * the app's own signed cookie session (`auth-crypto.ts`). No Supabase token is
 * trusted after that point, so there is exactly one session system in the app.
 */ __turbopack_context__.s([
    "authBaseUrl",
    ()=>authBaseUrl,
    "googleCallbackUrl",
    ()=>googleCallbackUrl,
    "readSupabaseConfig",
    ()=>readSupabaseConfig
]);
function readSupabaseConfig(env = process.env) {
    const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
    const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
    // Loosely validated on purpose: hosted projects are https, the local Supabase
    // CLI is http on 127.0.0.1, and both must pass.
    if (!/^https?:\/\/[^/\s]+$/.test(url) || anonKey.length < 20) return null;
    return {
        url,
        anonKey
    };
}
function authBaseUrl(env = process.env) {
    const configured = (env.NEXTAUTH_URL ?? "").trim();
    const base = configured.length > 0 ? configured : "http://localhost:3000";
    return base.replace(/\/+$/, "");
}
function googleCallbackUrl(base) {
    return `${base.replace(/\/+$/, "")}/auth/callback`;
}
}),
"[project]/src/lib/supabase/server.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createSupabaseServerClient",
    ()=>createSupabaseServerClient
]);
/**
 * Server-side Supabase client. Used for exactly one thing: the Google OAuth
 * handshake (authorization URL + code exchange). Everything after that is our
 * own Prisma session, so this client is never consulted on a normal request.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/config.ts [app-route] (ecmascript)");
;
;
;
async function createSupabaseServerClient() {
    const config = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readSupabaseConfig"])();
    if (!config) {
        throw new Error("Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.");
    }
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])(config.url, config.anonKey, {
        cookies: {
            getAll: ()=>store.getAll(),
            setAll: (cookiesToSet)=>{
                for (const { name, value, options } of cookiesToSet){
                    try {
                        store.set(name, value, options);
                    } catch  {
                    // Server Components render read-only cookie stores; the OAuth
                    // kickoff and the callback route both run where writes are allowed.
                    }
                }
            }
        }
    });
}
}),
]})(),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1reerdq6judun._.js.map