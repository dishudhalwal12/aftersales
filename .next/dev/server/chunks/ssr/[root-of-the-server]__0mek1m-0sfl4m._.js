module.exports = [
(()=>{"use strict";return[
"[project]/src/app/onboarding/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>OnboardingPage,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$seed$2d$facts$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/seed-facts.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$Logo$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/Logo.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$onboarding$2f$OnboardingWizard$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/onboarding/OnboardingWizard.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
const dynamic = "force-dynamic";
async function OnboardingPage() {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getCurrentUser"])();
    if (!user) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/auth");
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].business.count({
        where: {
            ownerId: user.id
        }
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            minHeight: "100dvh"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "nav",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "wrap nav-inner",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                            href: "/",
                            "aria-label": "AfterSales AI home",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$Logo$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Logo"], {}, void 0, false, {
                                fileName: "[project]/src/app/onboarding/page.tsx",
                                lineNumber: 22,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/onboarding/page.tsx",
                            lineNumber: 21,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "nav-links",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "tiny muted",
                                    children: user.email
                                }, void 0, false, {
                                    fileName: "[project]/src/app/onboarding/page.tsx",
                                    lineNumber: 25,
                                    columnNumber: 13
                                }, this),
                                existing > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/dashboard",
                                    className: "btn btn-sm",
                                    children: "Back to dashboard"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/onboarding/page.tsx",
                                    lineNumber: 27,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/onboarding/page.tsx",
                            lineNumber: 24,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/onboarding/page.tsx",
                    lineNumber: 20,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/onboarding/page.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "wrap",
                style: {
                    padding: "34px 24px 60px"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        style: {
                            marginBottom: 22,
                            maxWidth: 720
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "eyebrow",
                                children: "Onboarding"
                            }, void 0, false, {
                                fileName: "[project]/src/app/onboarding/page.tsx",
                                lineNumber: 37,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                style: {
                                    fontSize: 30,
                                    marginTop: 6
                                },
                                children: "Install your business into the agent"
                            }, void 0, false, {
                                fileName: "[project]/src/app/onboarding/page.tsx",
                                lineNumber: 38,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "muted",
                                style: {
                                    marginTop: 8
                                },
                                children: "Four short steps. What you type here becomes the only facts the agent is allowed to answer with — anything outside it escalates instead of being guessed."
                            }, void 0, false, {
                                fileName: "[project]/src/app/onboarding/page.tsx",
                                lineNumber: 39,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/onboarding/page.tsx",
                        lineNumber: 36,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$onboarding$2f$OnboardingWizard$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["OnboardingWizard"], {
                        presets: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$seed$2d$facts$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["PRESETS"].map((preset)=>({
                                label: preset.label,
                                facts: preset.business.facts
                            }))
                    }, void 0, false, {
                        fileName: "[project]/src/app/onboarding/page.tsx",
                        lineNumber: 45,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/onboarding/page.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/onboarding/page.tsx",
        lineNumber: 18,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/onboarding/OnboardingWizard.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OnboardingWizard",
    ()=>OnboardingWizard
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const OnboardingWizard = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call OnboardingWizard() from the server but OnboardingWizard is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/onboarding/OnboardingWizard.tsx", "OnboardingWizard");
}),
"[project]/src/components/onboarding/OnboardingWizard.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$onboarding$2f$OnboardingWizard$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/onboarding/OnboardingWizard.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$onboarding$2f$OnboardingWizard$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/ui/Logo.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Logo",
    ()=>Logo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
;
function Logo({ size = 30 }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "row",
        style: {
            gap: 10
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                width: size,
                height: size,
                viewBox: "0 0 32 32",
                role: "img",
                "aria-label": "AfterSales AI",
                style: {
                    flex: "none"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                        width: "32",
                        height: "32",
                        rx: "9",
                        fill: "#0A0A0A"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ui/Logo.tsx",
                        lineNumber: 12,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                        d: "M9 21.5 14.6 10h2.8L23 21.5h-3l-1.2-2.7h-5.6L12 21.5H9Zm4.9-5.1h4.2L16 11.9l-2.1 4.5Z",
                        fill: "#F8F8F6"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ui/Logo.tsx",
                        lineNumber: 13,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                        cx: "23",
                        cy: "9.4",
                        r: "1.6",
                        fill: "#10B981"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ui/Logo.tsx",
                        lineNumber: 17,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ui/Logo.tsx",
                lineNumber: 4,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                style: {
                    fontWeight: 660,
                    letterSpacing: "-0.02em",
                    fontSize: 16
                },
                children: [
                    "AfterSales",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        style: {
                            color: "var(--muted)"
                        },
                        children: " AI"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ui/Logo.tsx",
                        lineNumber: 20,
                        columnNumber: 19
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ui/Logo.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/Logo.tsx",
        lineNumber: 3,
        columnNumber: 5
    }, this);
}
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
"[project]/src/lib/seed-facts.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Demo content — the two seeded businesses from PRD §7, plus a third tenant that
 * exists only to prove isolation (AT-05). One source of truth for the database
 * seed, the onboarding "load preset" buttons and the test fixtures.
 */ __turbopack_context__.s([
    "BUSINESS_A",
    ()=>BUSINESS_A,
    "BUSINESS_A_TICKETS",
    ()=>BUSINESS_A_TICKETS,
    "BUSINESS_B",
    ()=>BUSINESS_B,
    "BUSINESS_B_TICKETS",
    ()=>BUSINESS_B_TICKETS,
    "BUSINESS_C",
    ()=>BUSINESS_C,
    "DEMO_EMAIL",
    ()=>DEMO_EMAIL,
    "DEMO_PASSWORD",
    ()=>DEMO_PASSWORD,
    "PRESETS",
    ()=>PRESETS,
    "RIVAL_EMAIL",
    ()=>RIVAL_EMAIL
]);
const BUSINESS_A = {
    id: "biz_cloudpulse_01",
    chunkPrefix: "cp",
    facts: {
        name: "CloudPulse CRM",
        businessType: "SaaS",
        description: "CloudPulse is inventory and GST billing software for retail shops. Shop owners use it to create invoices, track stock, and file GST returns without keeping an accountant on call.",
        productsServices: "Starter Plan: ₹499 per month for one user, including invoicing, inventory, and up to 500 invoices a month. Pro Plan: ₹1,499 per month for five users, including WhatsApp invoicing, GST API access, and priority support. Every plan starts with a 14-day free trial and there is no setup fee.",
        hours: "Monday to Saturday, 9:00 AM to 7:00 PM IST. Support is closed on Sundays and national holidays.",
        returnPolicy: "Full refund within 7 days of the initial subscription if fewer than 10 invoices have been generated. After 7 days the current month is not refunded, but you can cancel any time to stop the next renewal.",
        faqs: "Q: How do I export GSTR-1? A: Go to Reports > GST > Export JSON, then upload that file to the GST portal. Q: Can I use CloudPulse on my phone? A: Yes, the dashboard works in a mobile browser, and the Pro plan adds WhatsApp invoicing. Q: Does CloudPulse sync with Tally? A: Not today; invoices export as JSON and CSV, and Tally import is on the roadmap.",
        escalationEmail: "founder@cloudpulse.in",
        escalationPhone: "+919876543210",
        agentTone: "Clear, helpful, and professional",
        rawMarkdownUpload: ""
    }
};
const BUSINESS_B = {
    id: "biz_jaipursmile_02",
    chunkPrefix: "js",
    facts: {
        name: "Jaipur Smile Studio",
        businessType: "Healthcare Clinic",
        description: "Jaipur Smile Studio is a dental clinic in Jaipur offering preventive care, root canal treatment, crowns, and cosmetic dentistry.",
        productsServices: "Routine scaling and polishing: ₹1,200 per sitting. Root Canal Treatment (RCT): ₹4,500 per tooth. Ceramic Crown: ₹6,000 per tooth. Consultation with X-ray: ₹300.",
        hours: "Tuesday to Sunday, 10:00 AM to 8:00 PM IST. The clinic is closed on Mondays.",
        returnPolicy: "Appointments can be rescheduled free of charge up to 4 hours before the slot. Cancelling inside 4 hours, or not showing up, carries a ₹300 fee.",
        faqs: "Q: What should I do after an extraction? A: Bite on the gauze for 45 minutes, and avoid hot food or spitting for 24 hours. Q: Does a root canal hurt? A: The tooth is numbed before treatment; mild soreness for two days is normal. Q: Do you take insurance? A: We give itemised bills for reimbursement, but payment at the clinic is by cash or UPI.",
        escalationEmail: "frontdesk@jaipursmile.in",
        escalationPhone: "+919812345678",
        agentTone: "Warm, reassuring, and precise",
        rawMarkdownUpload: ""
    }
};
const BUSINESS_C = {
    id: "biz_nimbus_03",
    chunkPrefix: "nb",
    facts: {
        name: "Nimbus Billing",
        businessType: "SaaS",
        description: "A separate tenant used to prove that business-scoped queries cannot cross over.",
        productsServices: "Nimbus Plan: ₹99 per month, single user only.",
        hours: "Monday to Friday, 10:00 AM to 6:00 PM IST.",
        returnPolicy: "No refunds after the first 24 hours.",
        faqs: "Q: Where is the secret roadmap? A: In a different tenant — this row must never be returned.",
        escalationEmail: "security@nimbus.example",
        escalationPhone: "+919800000000",
        agentTone: "Neutral",
        rawMarkdownUpload: ""
    }
};
const DEMO_EMAIL = "judge@demo.aftersales.ai";
const RIVAL_EMAIL = "owner@nimbus.example";
const DEMO_PASSWORD = "judge-demo-41";
const A_REPLY_PRICING = "The Pro Plan is ₹1,499 per month and includes up to five users, WhatsApp invoicing, GST API access, and priority support. The Starter Plan is ₹499 per month for one user.";
const BUSINESS_A_TICKETS = [
    {
        externalId: "seed-a-01",
        channel: "WHATSAPP",
        customerName: "Ritika Sharma",
        customerHandle: "+919810000101",
        query: "What is the price of the Pro Plan and does it include WhatsApp invoicing?",
        state: "replied",
        specialist: "sales",
        intent: "pricing_inquiry",
        sentiment: "neutral",
        urgency: 20,
        confidence: 94,
        action: "answered",
        rule: "R6",
        reply: A_REPLY_PRICING,
        cited: [
            2
        ],
        ageHours: 2
    },
    {
        externalId: "seed-a-02",
        channel: "GMAIL",
        customerName: "Aman Verma",
        customerHandle: "aman@verma-traders.in",
        query: "GSTR-1 export keeps failing with a JSON error. I have tried twice already.",
        state: "replied",
        specialist: "technical",
        intent: "technical_issue",
        sentiment: "frustrated",
        urgency: 45,
        confidence: 78,
        action: "answered",
        rule: "R6",
        reply: "Open Reports > GST > Export JSON and upload that file to the GST portal. If the export still errors, reply with the invoice number and we will regenerate it for you.",
        cited: [
            5
        ],
        ageHours: 5
    },
    {
        externalId: "seed-a-03",
        channel: "INSTAGRAM",
        customerName: "Neha Gupta",
        customerHandle: "@neha.stores",
        query: "Can I get a refund if I cancel my subscription after three days?",
        state: "replied",
        specialist: "general",
        intent: "refund_policy",
        sentiment: "neutral",
        urgency: 25,
        confidence: 88,
        action: "answered",
        rule: "R6",
        reply: "Yes. You get a full refund within 7 days of the initial subscription if fewer than 10 invoices have been generated.",
        cited: [
            4
        ],
        ageHours: 26
    },
    {
        externalId: "seed-a-04",
        channel: "WHATSAPP",
        customerName: "Farhan Ali",
        customerHandle: "+919810000104",
        query: "Are you open on Saturday evening? Thanks for the quick help earlier!",
        state: "replied",
        specialist: "general",
        intent: "hours_inquiry",
        sentiment: "positive",
        urgency: 10,
        confidence: 91,
        action: "answered",
        rule: "R6",
        reply: "Support is open Monday to Saturday, 9:00 AM to 7:00 PM IST.",
        cited: [
            3
        ],
        ageHours: 30
    },
    {
        externalId: "seed-a-05",
        channel: "GMAIL",
        customerName: "Priya Nair",
        customerHandle: "priya@nairmart.in",
        query: "I want to talk to a real human manager about my last bill.",
        state: "escalated",
        specialist: "general",
        intent: "human_escalation",
        sentiment: "frustrated",
        urgency: 60,
        confidence: 62,
        action: "escalated",
        rule: "R1",
        reply: "Understood — a human from CloudPulse CRM will pick this up. Holding the answer.",
        cited: [],
        ageHours: 8
    },
    {
        externalId: "seed-a-06",
        channel: "WHATSAPP",
        customerName: "Sandeep Rao",
        customerHandle: "+919810000106",
        query: "You charged me twice this month and nobody is responding. This is unacceptable and I want it fixed today.",
        state: "escalated",
        specialist: "general",
        intent: "billing_dispute",
        sentiment: "distressed",
        urgency: 88,
        confidence: 66,
        action: "escalated",
        rule: "R3",
        reply: "I am not going to guess about a double charge. A human is taking this over now.",
        cited: [
            4
        ],
        ageHours: 12
    },
    {
        externalId: "seed-a-07",
        channel: "INSTAGRAM",
        customerName: "Karan Mehta",
        customerHandle: "@karan.kirana",
        query: "Can CloudPulse sync with my Tally ledger automatically?",
        state: "escalated",
        specialist: "technical",
        intent: "technical_issue",
        sentiment: "neutral",
        urgency: 30,
        confidence: 44,
        action: "escalated",
        rule: "R2",
        reply: "I do not want to guess on this one. A human from CloudPulse CRM will confirm.",
        cited: [],
        ageHours: 18
    },
    {
        externalId: "seed-a-08",
        channel: "GMAIL",
        customerName: "Meera Joshi",
        customerHandle: "meera@joshistore.in",
        query: "Do you have a cheaper plan for a single shop with one counter?",
        state: "triaged",
        specialist: "sales",
        intent: "pricing_inquiry",
        sentiment: "neutral",
        urgency: 15,
        confidence: 58,
        action: "draft",
        rule: "R5",
        reply: "The Starter Plan is ₹499 per month for one user and covers invoicing, inventory, and up to 500 invoices a month.",
        cited: [
            2
        ],
        ageHours: 20
    },
    {
        externalId: "seed-a-09",
        channel: "WHATSAPP",
        customerName: "Vikram Singh",
        customerHandle: "+919810000109",
        query: "Our payment failed and the shop is locked. This is urgent, we need it fixed immediately.",
        state: "escalated",
        specialist: "technical",
        intent: "payment_failure",
        sentiment: "distressed",
        urgency: 95,
        confidence: 72,
        action: "escalated",
        rule: "R3",
        reply: "A human is being pulled in right now — this is not something I will answer with a guess.",
        cited: [],
        ageHours: 34
    },
    {
        externalId: "seed-a-10",
        channel: "GMAIL",
        customerName: "Anita Desai",
        customerHandle: "anita@desaielectronics.in",
        query: "How do I add a second user to my Starter Plan?",
        state: "replied",
        specialist: "general",
        intent: "plan_change",
        sentiment: "neutral",
        urgency: 20,
        confidence: 69,
        action: "answered",
        rule: "R6",
        reply: "The Starter Plan is limited to one user. Moving to the Pro Plan covers five users and adds WhatsApp invoicing.",
        cited: [
            2
        ],
        ageHours: 40
    }
];
const BUSINESS_B_TICKETS = [
    {
        externalId: "seed-b-01",
        channel: "WHATSAPP",
        customerName: "Rahul Choudhary",
        customerHandle: "+919820000201",
        query: "What does a root canal cost at your clinic?",
        state: "replied",
        specialist: "sales",
        intent: "pricing_inquiry",
        sentiment: "neutral",
        urgency: 25,
        confidence: 92,
        action: "answered",
        rule: "R6",
        reply: "A Root Canal Treatment is ₹4,500 per tooth. A ceramic crown, if needed, is ₹6,000.",
        cited: [
            2
        ],
        ageHours: 3
    },
    {
        externalId: "seed-b-02",
        channel: "INSTAGRAM",
        customerName: "Sneha Agarwal",
        customerHandle: "@sneha.agarwal",
        query: "Can I book a cleaning on Sunday at 11 in the morning?",
        state: "replied",
        specialist: "general",
        intent: "booking_request",
        sentiment: "positive",
        urgency: 20,
        confidence: 87,
        action: "answered",
        rule: "R6",
        reply: "Yes — the clinic is open Tuesday to Sunday, 10:00 AM to 8:00 PM, so Sunday at 11 works.",
        cited: [
            3
        ],
        ageHours: 7
    },
    {
        externalId: "seed-b-03",
        channel: "GMAIL",
        customerName: "Mohit Bansal",
        customerHandle: "mohit.b@gmail.com",
        query: "Are you open on Monday?",
        state: "replied",
        specialist: "general",
        intent: "hours_inquiry",
        sentiment: "neutral",
        urgency: 10,
        confidence: 90,
        action: "answered",
        rule: "R6",
        reply: "The clinic is closed on Mondays. We are open Tuesday to Sunday, 10:00 AM to 8:00 PM.",
        cited: [
            3
        ],
        ageHours: 14
    },
    {
        externalId: "seed-b-04",
        channel: "WHATSAPP",
        customerName: "Kavita Sharma",
        customerHandle: "+919820000204",
        query: "I need to reschedule tomorrow's appointment, is there a charge?",
        state: "triaged",
        specialist: "general",
        intent: "refund_policy",
        sentiment: "neutral",
        urgency: 35,
        confidence: 61,
        action: "draft",
        rule: "R5",
        reply: "Rescheduling is free up to 4 hours before the slot; inside 4 hours there is a ₹300 fee.",
        cited: [
            4
        ],
        ageHours: 22
    },
    {
        externalId: "seed-b-05",
        channel: "WHATSAPP",
        customerName: "Arjun Patel",
        customerHandle: "+919820000205",
        query: "What should I do after my extraction this morning?",
        state: "replied",
        specialist: "general",
        intent: "post_op_care",
        sentiment: "neutral",
        urgency: 55,
        confidence: 74,
        action: "answered",
        rule: "R6",
        reply: "Bite on the gauze for 45 minutes, and avoid hot food or spitting for 24 hours.",
        cited: [
            5
        ],
        ageHours: 28
    },
    {
        externalId: "seed-b-06",
        channel: "INSTAGRAM",
        customerName: "Deepak Yadav",
        customerHandle: "@deepak.y",
        query: "My crown fell off last night and it is hurting. Get me a doctor now.",
        state: "escalated",
        specialist: "general",
        intent: "dental_emergency",
        sentiment: "distressed",
        urgency: 90,
        confidence: 40,
        action: "escalated",
        rule: "R2",
        reply: "I am not going to guess on pain. The clinic team is being alerted right now.",
        cited: [],
        ageHours: 32
    },
    {
        externalId: "seed-b-07",
        channel: "GMAIL",
        customerName: "Pooja Jain",
        customerHandle: "pooja.jain@gmail.com",
        query: "Do you offer any discount on two crowns together?",
        state: "triaged",
        specialist: "sales",
        intent: "pricing_inquiry",
        sentiment: "neutral",
        urgency: 15,
        confidence: 55,
        action: "draft",
        rule: "R5",
        reply: "A ceramic crown is ₹6,000 per tooth. The clinic will confirm any combined-treatment pricing.",
        cited: [
            2
        ],
        ageHours: 45
    },
    {
        externalId: "seed-b-08",
        channel: "WHATSAPP",
        customerName: "Nitin Kumar",
        customerHandle: "+919820000208",
        query: "Severe pain after my RCT, please help immediately.",
        state: "escalated",
        specialist: "general",
        intent: "dental_emergency",
        sentiment: "distressed",
        urgency: 95,
        confidence: 70,
        action: "escalated",
        rule: "R3",
        reply: "A human from the clinic is being alerted immediately. Do not wait on an automated reply.",
        cited: [],
        ageHours: 50
    }
];
const PRESETS = [
    {
        id: "a",
        label: "Load Seeded Business A (SaaS)",
        business: BUSINESS_A
    },
    {
        id: "b",
        label: "Load Seeded Business B (D2C Clinic)",
        business: BUSINESS_B
    }
];
}),
]})(),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/src/app/onboarding/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/onboarding/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0mek1m-0sfl4m._.js.map