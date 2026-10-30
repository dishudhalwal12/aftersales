module.exports = [
(()=>{"use strict";return[
"[project]/.next-internal/server/app/auth/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "00986d7930ed167ab10a01739c90df1d27c8ae1544",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["googleSignInAction"],
    "00cb25b269d8ed798ad2ae76785f1a3f7b84c00c23",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["demoLoginAction"],
    "6018ff8c60424b74b82b7a8aa431b6a90701ac9658",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["signUpAction"],
    "608f19edb2ecf8b2ffb14cad405aec76c7ffe84885",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["signInAction"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$auth$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/auth/page/actions.js { ACTIONS_MODULE0 => "[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)");
}),
"[project]/.next-internal/server/app/auth/page/actions.js { ACTIONS_MODULE0 => \"[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)");
;
;
;
;
}),
"[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"0006a1be324bc6093c4a5cf1da5cd28798fa2c6a18":{"name":"signOutAction"},"00986d7930ed167ab10a01739c90df1d27c8ae1544":{"name":"googleSignInAction"},"00cb25b269d8ed798ad2ae76785f1a3f7b84c00c23":{"name":"demoLoginAction"},"6018ff8c60424b74b82b7a8aa431b6a90701ac9658":{"name":"signUpAction"},"608f19edb2ecf8b2ffb14cad405aec76c7ffe84885":{"name":"signInAction"}},"src/app/auth/actions.ts",""] */ __turbopack_context__.s([
    "demoLoginAction",
    ()=>demoLoginAction,
    "googleSignInAction",
    ()=>googleSignInAction,
    "signInAction",
    ()=>signInAction,
    "signOutAction",
    ()=>signOutAction,
    "signUpAction",
    ()=>signUpAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-crypto.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/config.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
const DEMO_EMAIL = "judge@demo.aftersales.ai";
function field(formData, key) {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
}
async function signInAction(_previous, formData) {
    const email = field(formData, "email").toLowerCase();
    const password = field(formData, "password");
    if (email.length === 0 || password.length === 0) {
        return {
            error: "Email and password are required."
        };
    }
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.findUnique({
        where: {
            email
        }
    });
    if (!user || !(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["verifyPassword"])(password, user.passwordHash)) {
        return {
            error: "Those credentials do not match an account."
        };
    }
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["startSession"])(user.id);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["postAuthPath"])(user.id));
}
async function signUpAction(_previous, formData) {
    const name = field(formData, "name");
    const email = field(formData, "email").toLowerCase();
    const password = field(formData, "password");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return {
            error: "Enter a valid email address."
        };
    }
    if (password.length < 8) {
        return {
            error: "Use at least 8 characters for the password."
        };
    }
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.findUnique({
        where: {
            email
        }
    });
    if (existing) {
        return {
            error: "An account with that email already exists. Sign in instead."
        };
    }
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.create({
        data: {
            email,
            name: name.length > 0 ? name : null,
            passwordHash: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["hashPassword"])(password)
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["startSession"])(user.id);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["postAuthPath"])(user.id));
}
async function demoLoginAction() {
    const email = DEMO_EMAIL;
    const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.findUnique({
        where: {
            email
        }
    }) ?? await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.create({
        data: {
            email,
            name: "Judge Demo",
            passwordHash: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["hashPassword"])(crypto.randomUUID())
        }
    });
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["startSession"])(user.id);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["postAuthPath"])(user.id));
}
async function googleSignInAction() {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["readSupabaseConfig"])() === null) {
        return {
            error: "Google sign-in is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing."
        };
    }
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createSupabaseServerClient"])();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            // The browser must reach Google, but the PKCE verifier has to land in a
            // cookie first — so we take the URL and redirect ourselves.
            skipBrowserRedirect: true,
            redirectTo: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["googleCallbackUrl"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["authBaseUrl"])()),
            queryParams: {
                prompt: "select_account"
            }
        }
    });
    if (error !== null || data.url === null || data.url.length === 0) {
        return {
            error: `Google sign-in could not start: ${error?.message ?? "no authorization URL was returned."}`
        };
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(data.url);
}
async function signOutAction() {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["endSession"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/");
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    signInAction,
    signUpAction,
    demoLoginAction,
    googleSignInAction,
    signOutAction
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signInAction, "608f19edb2ecf8b2ffb14cad405aec76c7ffe84885", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signUpAction, "6018ff8c60424b74b82b7a8aa431b6a90701ac9658", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(demoLoginAction, "00cb25b269d8ed798ad2ae76785f1a3f7b84c00c23", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(googleSignInAction, "00986d7930ed167ab10a01739c90df1d27c8ae1544", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(signOutAction, "0006a1be324bc6093c4a5cf1da5cd28798fa2c6a18", null);
}),
"[project]/src/lib/auth-crypto.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/auth.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
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
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-crypto.ts [app-rsc] (ecmascript)");
;
;
;
;
async function startSession(userId) {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["SESSION_COOKIE"], (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["signSessionToken"])(userId), (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sessionCookieOptions"])());
}
async function endSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["SESSION_COOKIE"], "", {
        ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sessionCookieOptions"])(),
        maxAge: 0
    });
}
async function getSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["verifySessionToken"])(store.get(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$crypto$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["SESSION_COOKIE"])?.value);
}
async function getCurrentUser() {
    const session = await getSession();
    if (!session) return null;
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].user.findUnique({
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
    const count = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].business.count({
        where: {
            ownerId: userId
        }
    });
    return count === 0 ? "/onboarding" : "/dashboard";
}
}),
"[project]/src/lib/db.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/supabase/config.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/supabase/server.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createSupabaseServerClient",
    ()=>createSupabaseServerClient
]);
/**
 * Server-side Supabase client. Used for exactly one thing: the Google OAuth
 * handshake (authorization URL + code exchange). Everything after that is our
 * own Prisma session, so this client is never consulted on a normal request.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/supabase/config.ts [app-rsc] (ecmascript)");
;
;
;
async function createSupabaseServerClient() {
    const config = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabase$2f$config$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["readSupabaseConfig"])();
    if (!config) {
        throw new Error("Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.");
    }
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createServerClient"])(config.url, config.anonKey, {
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
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__17sl_z7x_d8em._.js.map