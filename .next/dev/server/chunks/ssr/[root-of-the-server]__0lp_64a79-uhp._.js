module.exports = [
(()=>{"use strict";return[
"[project]/src/app/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>LandingPage,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$llm$2d$orchestrator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/llm-orchestrator.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$landing$2f$HeroStage$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/landing/HeroStage.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$Logo$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/Logo.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
;
const dynamic = "force-dynamic";
const STEPS = [
    {
        n: "01",
        title: "Teach it your business",
        body: "Twelve answers — prices, hours, refund policy, FAQs — compile into one versioned business_brain.md. Upload your own markdown instead if you already have it."
    },
    {
        n: "02",
        title: "It triages every channel",
        body: "One classifier returns four fields: intent, urgency, sentiment, confidence. Seven ordered rules turn those four fields into exactly three outcomes: reply, draft, escalate."
    },
    {
        n: "03",
        title: "You only see the unsure ones",
        body: "Below confidence 50 the agent never answers. It escalates with the rule and the reason attached, because a coin-flip is not a customer answer."
    }
];
const RULES = [
    [
        "R1",
        "the customer asks for a human",
        "escalate"
    ],
    [
        "R2",
        "confidence < 50, or no grounded chunk",
        "escalate"
    ],
    [
        "R3",
        "distress, or a case needing human judgment",
        "escalate"
    ],
    [
        "R4",
        "urgency ≥ 80",
        "escalate"
    ],
    [
        "R5",
        "the channel is draft-only",
        "hold as draft"
    ],
    [
        "R6",
        "grounded, confident, not urgent",
        "auto-reply"
    ],
    [
        "R7",
        "the classifier failed",
        "fail safe"
    ]
];
const FEATURES = [
    {
        title: "Four channels, one queue",
        body: "WhatsApp, Instagram DM, Gmail and one voice line land in the same list. Channel adapters normalize; nothing downstream sees a raw provider payload."
    },
    {
        title: "Every answer cites its source",
        body: "A reply may only be sent when at least one retrieved chunk from this business is cited. Fabricated chunk ids are filtered before routing decides."
    },
    {
        title: "Tenant isolation is structural",
        body: "businessId comes from the session and is checked on every read. Another owner's ticket id returns 403 — there is no code path that takes it from the model."
    },
    {
        title: "Webhooks are idempotent",
        body: "A unique externalMessageId means a replayed webhook creates one ticket and one decision, not two replies to the same customer."
    },
    {
        title: "Weekly recurring complaints",
        body: "Tickets are grouped by intent and sentiment, so the same complaint surfacing eleven times reads as a number instead of a feeling."
    },
    {
        title: "It fails closed",
        body: "If the model key is missing or the call dies, the pipeline writes R7, marks the ticket failed and sends nothing. It never fakes a success."
    }
];
async function LandingPage() {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getCurrentUser"])();
    const provider = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$llm$2d$orchestrator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveProvider"])({
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY
    });
    const degraded = provider === "heuristic";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "nav",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "wrap nav-inner",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$Logo$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["Logo"], {}, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 85,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                            className: "nav-links",
                            "aria-label": "Primary",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: "#how",
                                    children: "How it works"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 87,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: "#rules",
                                    children: "Routing rules"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 88,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: "#features",
                                    children: "Features"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 89,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                    href: user ? "/dashboard" : "/auth",
                                    className: "btn btn-primary btn-sm",
                                    children: user ? "Go to dashboard" : "Get started"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 90,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 86,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 84,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 83,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "wrap",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "hero",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "eyebrow",
                                            children: "SPHINX '26 · Problem statement 2.5"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 101,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            children: [
                                                "Your support queue,",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("br", {}, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 104,
                                                    columnNumber: 17
                                                }, this),
                                                "minus the guessing."
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 102,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "hero-sub",
                                            children: "AfterSales AI reads every inbound message, answers the repetitive ones from your own business facts, and hands you the ones it is not sure about — with the rule and the reason attached."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 107,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "hero-cta",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                                    href: user ? "/dashboard" : "/auth",
                                                    className: "btn btn-primary",
                                                    children: user ? "Open the dashboard" : "Open the live demo"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 113,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                    href: "#rules",
                                                    className: "btn",
                                                    children: "See the routing rules"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 116,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 112,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "hero-note",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: "4 channels · 6 chunks per business · 7 ordered rules"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 121,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: degraded ? "Runs with no model key — the offline classifier is labelled on screen" : "Model path live"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 122,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 120,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 100,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$landing$2f$HeroStage$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["HeroStage"], {}, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 129,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 99,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 98,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "section",
                        id: "how",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "wrap",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "section-head",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "eyebrow",
                                                    children: "How it works"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 137,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    children: "Three steps, one contract"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 138,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 136,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "tiny muted",
                                            style: {
                                                maxWidth: 320
                                            },
                                            children: "The classifier proposes four fields. The router disposes. Nothing about the decision lives inside the language model."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 140,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 135,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid-3",
                                    children: STEPS.map((step)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "glass step-card",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "step-num",
                                                    children: step.n
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 148,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    style: {
                                                        fontSize: 16
                                                    },
                                                    children: step.title
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 149,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "muted tiny",
                                                    style: {
                                                        lineHeight: 1.6
                                                    },
                                                    children: step.body
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 150,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, step.n, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 147,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 145,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 134,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 133,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "section",
                        id: "rules",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "wrap",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "section-head",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "eyebrow",
                                                    children: "The decision surface"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 163,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                    children: "Seven rules, first match wins"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 164,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 162,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "tiny muted",
                                            style: {
                                                maxWidth: 340
                                            },
                                            children: "R1–R4 escalate. R5 holds a draft. R6 is the repetitive volume, handled. R7 exists so a broken classifier is never a silent reply."
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 166,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 161,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "glass panel",
                                    style: {
                                        padding: 8
                                    },
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                        className: "rule-table",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                            style: {
                                                                width: 60
                                                            },
                                                            children: "Rule"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 175,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                            children: "Condition"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 176,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                            style: {
                                                                width: 150
                                                            },
                                                            children: "Outcome"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 177,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 174,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 173,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                children: RULES.map(([rule, condition, outcome])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                        "data-hit": rule === "R2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: "badge badge-neutral mono",
                                                                    children: rule
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/page.tsx",
                                                                    lineNumber: 184,
                                                                    columnNumber: 25
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 183,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                children: condition
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 186,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    className: `badge ${outcome === "auto-reply" ? "badge-sent" : outcome === "hold as draft" ? "badge-draft" : "badge-esc"}`,
                                                                    children: outcome
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/app/page.tsx",
                                                                    lineNumber: 188,
                                                                    columnNumber: 25
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/page.tsx",
                                                                lineNumber: 187,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, rule, true, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 182,
                                                        columnNumber: 21
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 180,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 172,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 171,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "tiny muted",
                                    style: {
                                        marginTop: 10
                                    },
                                    children: "R2 is the product: confidence below 50 is a human's job, not a language model's."
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 205,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 160,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 159,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "section",
                        id: "features",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "wrap",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "section-head",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "eyebrow",
                                                children: "What is inside"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 216,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                                children: "Built to be inspected, not trusted"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 217,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 215,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 214,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid-3",
                                    children: FEATURES.map((feature)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "glass feature-card",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    children: feature.title
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 223,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    children: feature.body
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 224,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, feature.title, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 222,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 220,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 213,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 212,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "section",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "wrap",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "glass panel",
                                style: {
                                    padding: 34,
                                    textAlign: "center"
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "eyebrow",
                                        style: {
                                            marginBottom: 8
                                        },
                                        children: "Two seeded businesses, one click"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 234,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        style: {
                                            fontSize: 28
                                        },
                                        children: "Ask CloudPulse about its Pro Plan. Then ask the dental clinic."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 237,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "muted",
                                        style: {
                                            maxWidth: 620,
                                            margin: "10px auto 20px"
                                        },
                                        children: "Same question, same pipeline, different answer — or a clean escalation when the facts are not there. That contrast is the whole product."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 238,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                        href: "/auth",
                                        className: "btn btn-primary",
                                        children: "1-click judge demo login"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 242,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 233,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 232,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 231,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
                className: "footer",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "wrap",
                    style: {
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                        width: "100%"
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: "Team 41 · Divyanshu Saini & Pulkit Khowal · PS 2.5"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 252,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: degraded ? "Offline classifier active — answers are extractive and cited." : "Model-backed classifier active."
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 253,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 251,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 250,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 82,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/landing/HeroStage.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HeroStage",
    ()=>HeroStage
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const HeroStage = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call HeroStage() from the server but HeroStage is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/landing/HeroStage.tsx", "HeroStage");
}),
"[project]/src/components/landing/HeroStage.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$landing$2f$HeroStage$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/landing/HeroStage.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$landing$2f$HeroStage$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
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
"[project]/src/lib/llm-orchestrator.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "classifyAndDraft",
    ()=>classifyAndDraft,
    "heuristicSentiment",
    ()=>heuristicSentiment,
    "heuristicUrgency",
    ()=>heuristicUrgency,
    "resolveProvider",
    ()=>resolveProvider,
    "validateLlmResponse",
    ()=>validateLlmResponse
]);
/**
 * LLM orchestration — one structured call per inbound contact (PRD §4.2).
 *
 * Two providers, one contract:
 *   openrouter — real model, strict JSON, any failure becomes Rule R7 downstream.
 *   heuristic  — no network: retrieval-scored classifier used when no key is set.
 *                It is labelled `degraded` everywhere it surfaces, so the app can
 *                never pass itself off as model-backed when it is not.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rag$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rag.ts [app-rsc] (ecmascript)");
;
const PROVIDERS = new Set([
    "openrouter",
    "heuristic"
]);
const SPECIALISTS = new Set([
    "general",
    "technical",
    "sales"
]);
const SENTIMENTS = new Set([
    "positive",
    "neutral",
    "frustrated",
    "distressed"
]);
function resolveProvider(env) {
    const configured = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
    if (PROVIDERS.has(configured)) return configured;
    return (env.OPENROUTER_API_KEY ?? "").trim().length > 0 ? "openrouter" : "heuristic";
}
function isIntegerInRange(value, min, max) {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function validateLlmResponse(value) {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value;
    const specialist = candidate["specialist"];
    const sentiment = candidate["sentiment"];
    const intent = candidate["intent"];
    const replyText = candidate["reply_text"];
    const cited = candidate["cited_chunk_ids"];
    if (typeof specialist !== "string" || !SPECIALISTS.has(specialist)) return null;
    if (typeof sentiment !== "string" || !SENTIMENTS.has(sentiment)) return null;
    if (typeof intent !== "string" || intent.trim().length === 0) return null;
    if (typeof replyText !== "string") return null;
    if (typeof candidate["explicit_human_request"] !== "boolean") return null;
    if (typeof candidate["requires_human_judgment"] !== "boolean") return null;
    if (!isIntegerInRange(candidate["urgency_score"], 0, 100)) return null;
    if (!isIntegerInRange(candidate["confidence_score"], 0, 100)) return null;
    if (!Array.isArray(cited) || cited.some((id)=>typeof id !== "string")) return null;
    return {
        specialist: specialist,
        intent: intent.trim().slice(0, 80),
        sentiment: sentiment,
        urgency_score: candidate["urgency_score"],
        confidence_score: candidate["confidence_score"],
        explicit_human_request: candidate["explicit_human_request"],
        requires_human_judgment: candidate["requires_human_judgment"],
        cited_chunk_ids: [
            ...new Set(cited)
        ],
        reply_text: replyText.trim()
    };
}
// ---------------------------------------------------------------------------
// Offline (heuristic) provider
// ---------------------------------------------------------------------------
const TECHNICAL = /\b(export|error|bug|fail|broken|install|setup|set up|integrat|api|gstr|json|login|crash|troubleshoot|not working|sync|migrat|downtime|outage)\b/i;
const SALES = /\b(price|pricing|cost|charge|plan|discount|upgrade|buy|purchase|subscription|fee|quote|compar|trial|billing cycle)\b/i;
const DISTRESSED = /\b(terrible|worst|furious|angry|unacceptable|disgusting|lawyer|legal|sue|fraud|scam|emergency|harass|appalling|ridiculous)\b/i;
const FRUSTRATED = /\b(frustrat|annoy|again|still|twice|third time|second time|keep|waiting|late|delay|broken|not working|no response|no reply|nobody|ignored|asked)\b/i;
const POSITIVE = /\b(thanks|thank you|great|love|awesome|perfect|excellent|amazing|happy|helpful)\b/i;
const HUMAN_REQUEST = /\b(human|real person|manager|representative|supervisor|talk to someone|speak to someone|agent)\b/i;
const HUMAN_JUDGMENT = /\b(lawyer|legal|sue|court|police|safety|injur|allerg|medical emergency|refund dispute|chargeback|fraud|scam)\b/i;
const URGENT = /\b(urgent|urgently|asap|immediately|right now|emergency|today|tonight|tomorrow|deadline|production is down|system is down|outage)\b/i;
function specialistFor(query) {
    if (TECHNICAL.test(query)) return "technical";
    if (SALES.test(query)) return "sales";
    return "general";
}
function intentFor(query, specialist) {
    if (HUMAN_REQUEST.test(query)) return "human_escalation";
    if (/\brefund|return|cancel|money back\b/i.test(query)) return "refund_policy";
    if (/\bprice|pricing|plan|cost|charge|subscription|discount\b/i.test(query)) return "pricing_inquiry";
    if (/\bhour|open|close|timing|timings\b/i.test(query)) return "hours_inquiry";
    if (/\bappointment|booking|book|slot|reschedul\b/i.test(query)) return "booking_request";
    if (/\bexport|error|bug|fail|install|setup|not working|crash\b/i.test(query)) return "technical_issue";
    if (specialist === "sales") return "sales_inquiry";
    return "general_inquiry";
}
function heuristicSentiment(query) {
    if (DISTRESSED.test(query)) return "distressed";
    if (FRUSTRATED.test(query)) return "frustrated";
    if (POSITIVE.test(query)) return "positive";
    return "neutral";
}
function heuristicUrgency(query, sentiment) {
    let score = 20;
    if (URGENT.test(query)) score += 35;
    if (sentiment === "distressed") score += 30;
    if (sentiment === "frustrated") score += 10;
    if (/\brefund|charged twice|payment failed|charged\b/i.test(query)) score += 20;
    if (/\bdown|outage|not working|data loss\b/i.test(query)) score += 15;
    return Math.max(0, Math.min(100, score));
}
function offlineDecision(business, query, retrieved) {
    const specialist = specialistFor(query);
    const sentiment = heuristicSentiment(query);
    const top = retrieved[0];
    const confidence = top ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rag$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["retrievalConfidence"])(query, retrieved) : 0;
    const grounded = confidence >= 50 && retrieved.length > 0;
    const cited = grounded ? retrieved.slice(0, 2).map((chunk)=>chunk.id) : [];
    const answer = grounded ? retrieved.slice(0, 2).map((chunk)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rag$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["bestSentences"])(query, chunk.content, 2)).join(" ").slice(0, 700) : `I don't want to guess on this one. Let me get a human from ${business.name} to answer you directly — they'll be with you shortly.`;
    return {
        specialist,
        intent: intentFor(query, specialist),
        sentiment,
        urgency_score: heuristicUrgency(query, sentiment),
        confidence_score: confidence,
        explicit_human_request: HUMAN_REQUEST.test(query),
        requires_human_judgment: HUMAN_JUDGMENT.test(query),
        cited_chunk_ids: cited,
        reply_text: answer
    };
}
// ---------------------------------------------------------------------------
// OpenRouter provider
// ---------------------------------------------------------------------------
function buildSystemPrompt(business) {
    return [
        `You are the internal AI Support & Triage Engine for "${business.name}" (${business.businessType}).`,
        `Tone: ${business.agentTone}.`,
        "",
        "CRITICAL GROUNDING RULES:",
        "1. You may ONLY use facts explicitly present in the PROVIDED KNOWLEDGE CHUNKS below.",
        "2. Never invent prices, policies, hours, links, or technical steps.",
        "3. Select the best internal runtime specialist:",
        '   - "general": FAQs, hours, policies, order/appointment inquiries.',
        '   - "technical": troubleshooting, bug reports, setup steps, usage help.',
        '   - "sales": pricing comparisons, plan upgrades, product recommendations, discounts.',
        "4. Output strictly valid JSON matching this schema and nothing else:",
        "{",
        '  "specialist": "general" | "technical" | "sales",',
        '  "intent": "short snake_case label",',
        '  "sentiment": "positive" | "neutral" | "frustrated" | "distressed",',
        '  "urgency_score": integer 0-100,',
        '  "confidence_score": integer 0-100 (MUST be < 50 if the chunks do not directly answer the question),',
        '  "explicit_human_request": boolean,',
        '  "requires_human_judgment": boolean (severe distress, legal threat, billing dispute, safety issue),',
        '  "cited_chunk_ids": array of the exact chunk ids used, empty [] if none match,',
        '  "reply_text": grounded reply, or a polite hand-off message when confidence < 50',
        "}"
    ].join("\n");
}
function extractJson(content) {
    const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(trimmed.slice(start, end + 1));
    } catch  {
        return null;
    }
}
async function callOpenRouter(apiKey, model, business, query, retrieved) {
    const chunkBlock = retrieved.map((chunk)=>`[chunk_id: ${chunk.id}] (${chunk.section})\n${chunk.content}`).join("\n\n");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "AfterSales AI — Team 41"
        },
        body: JSON.stringify({
            model,
            temperature: 0.1,
            response_format: {
                type: "json_object"
            },
            messages: [
                {
                    role: "system",
                    content: buildSystemPrompt(business)
                },
                {
                    role: "user",
                    content: `PROVIDED KNOWLEDGE CHUNKS:\n\n${chunkBlock || "(none retrieved)"}\n\nCUSTOMER MESSAGE:\n${query}`
                }
            ]
        }),
        signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) {
        throw new Error(`classifier provider returned HTTP ${response.status}`);
    }
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("classifier provider returned an empty completion");
    }
    const parsed = validateLlmResponse(extractJson(content));
    if (!parsed) throw new Error("classifier output failed schema validation");
    return parsed;
}
async function classifyAndDraft(input) {
    const env = input.env ?? {
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        LLM_MODEL_ID: process.env.LLM_MODEL_ID
    };
    const provider = resolveProvider(env);
    if (provider === "heuristic") {
        return {
            ok: true,
            result: offlineDecision(input.business, input.query, input.retrieved),
            provider,
            degraded: true
        };
    }
    const apiKey = (env.OPENROUTER_API_KEY ?? "").trim();
    if (apiKey.length === 0) {
        return {
            ok: false,
            provider,
            error: "OPENROUTER_API_KEY is not set"
        };
    }
    try {
        const result = await callOpenRouter(apiKey, (env.LLM_MODEL_ID ?? "").trim() || "meta-llama/llama-3.3-70b-instruct", input.business, input.query, input.retrieved);
        return {
            ok: true,
            result,
            provider,
            degraded: false
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "classifier call failed";
        return {
            ok: false,
            provider,
            error: message
        };
    }
}
}),
"[project]/src/lib/rag.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Business brain: compile -> chunk -> retrieve.
 *
 * Pure and dependency-free so `node --test` runs it with no bundler and no
 * database. Every function is deterministic: the same business facts always
 * produce the same chunks, which is what makes a citation reproducible.
 */ __turbopack_context__.s([
    "bestSentences",
    ()=>bestSentences,
    "chunkMarkdown",
    ()=>chunkMarkdown,
    "compileBrainMd",
    ()=>compileBrainMd,
    "retrievalConfidence",
    ()=>retrievalConfidence,
    "searchMarkdownRag",
    ()=>searchMarkdownRag,
    "stem",
    ()=>stem,
    "tokenize",
    ()=>tokenize
]);
const MAX_CHUNK_WORDS = 220;
const KEYWORD_LIMIT = 60;
const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before being below
   between both but by can cannot could did do does doing down during each few for from further had has
   have having he her here hers herself him himself his how i if in into is it its itself just me more
   most my myself no nor not of off on once only or other our ours ourselves out over own same she should
   so some such than that the their theirs them themselves then there these they this those through to too
   under until up very was we were what when where which while who whom why will with would you your yours
   yourself yourselves please hi hello hey dear sir madam thanks thank kindly let us tell give know want
   need also may might must shall`.split(/\s+/).filter(Boolean));
function stem(token) {
    if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.length > 5 && token.endsWith("ing")) {
        const base = token.slice(0, -3);
        return base.endsWith("ll") ? base.slice(0, -1) : base;
    }
    if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
    if (token.length > 4 && token.endsWith("e")) return token.slice(0, -1);
    return token;
}
function tokenize(text) {
    return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^\p{L}\p{N}]+/u).filter((raw)=>raw.length > 1 && !STOPWORDS.has(raw)).map(stem).filter((token)=>token.length > 1 && !STOPWORDS.has(token));
}
function keywordsFor(content, section) {
    const counts = new Map();
    for (const token of tokenize(`${section} ${section} ${content}`)){
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [
        ...counts.entries()
    ].sort((a, b)=>b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, KEYWORD_LIMIT).map(([token])=>token).join(",");
}
function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
/**
 * Split an oversized section on paragraph boundaries, then on sentences when a
 * single paragraph is still too long. Never drops text.
 */ function splitSection(body) {
    const paragraphs = body.split(/\n{2,}/).map((p)=>p.trim()).filter(Boolean);
    const pieces = [];
    let buffer = [];
    let bufferedWords = 0;
    const flush = ()=>{
        if (buffer.length > 0) {
            pieces.push(buffer.join("\n\n"));
            buffer = [];
            bufferedWords = 0;
        }
    };
    for (const paragraph of paragraphs){
        const words = wordCount(paragraph);
        if (words > MAX_CHUNK_WORDS) {
            flush();
            const sentences = paragraph.split(/(?<=[.!?])\s+/);
            let sentenceBuffer = [];
            let sentenceWords = 0;
            for (const sentence of sentences){
                const count = wordCount(sentence);
                if (sentenceWords + count > MAX_CHUNK_WORDS && sentenceBuffer.length > 0) {
                    pieces.push(sentenceBuffer.join(" "));
                    sentenceBuffer = [];
                    sentenceWords = 0;
                }
                sentenceBuffer.push(sentence);
                sentenceWords += count;
            }
            if (sentenceBuffer.length > 0) pieces.push(sentenceBuffer.join(" "));
            continue;
        }
        if (bufferedWords + words > MAX_CHUNK_WORDS && buffer.length > 0) flush();
        buffer.push(paragraph);
        bufferedWords += words;
    }
    flush();
    return pieces;
}
function compileBrainMd(facts) {
    const sections = [
        [
            "Identity",
            `${facts.description}\n\nBusiness type: ${facts.businessType}. Agent tone: ${facts.agentTone}.`
        ],
        [
            "Products & Pricing",
            facts.productsServices
        ],
        [
            "Hours",
            facts.hours
        ],
        [
            "Return & Cancellation Policy",
            facts.returnPolicy
        ],
        [
            "FAQs",
            facts.faqs
        ],
        [
            "Escalation & Contact",
            `A human from ${facts.name} can be reached at ${facts.escalationEmail} or ${facts.escalationPhone}.`
        ],
        [
            "Uploaded Knowledge",
            facts.rawMarkdownUpload
        ]
    ];
    const header = `# ${facts.name} — Business Brain\n\n_Business type: ${facts.businessType} · Compiled by AfterSales AI._\n`;
    const body = sections.filter(([, content])=>content.trim().length > 0).map(([heading, content])=>`## ${heading}\n\n${content.trim()}\n`).join("\n");
    return `${header}\n${body}`;
}
function chunkMarkdown(markdown, maxWords = MAX_CHUNK_WORDS) {
    const normalized = markdown.replace(/\r\n/g, "\n").trim();
    if (normalized.length === 0) return [];
    const lines = normalized.split("\n");
    const sections = [];
    let current = {
        heading: "General",
        body: []
    };
    let sawHeading = false;
    for (const line of lines){
        const heading = /^##\s+(.*)$/.exec(line);
        if (heading?.[1]) {
            // Everything before the first `##` is document preamble, not a section.
            if (sawHeading && current.body.join("\n").trim().length > 0) sections.push(current);
            current = {
                heading: heading[1].trim(),
                body: []
            };
            sawHeading = true;
            continue;
        }
        if (/^#\s+/.test(line)) continue; // document title, not a section
        current.body.push(line);
    }
    if (sawHeading || current.body.join("\n").trim().length > 0) sections.push(current);
    const drafts = [];
    for (const section of sections){
        const body = section.body.join("\n").trim();
        if (body.length === 0) continue;
        for (const piece of splitSection(body)){
            drafts.push({
                section: section.heading,
                content: piece,
                keywords: keywordsFor(piece, section.heading)
            });
        }
    }
    return drafts;
}
function buildIndex(chunk) {
    const tokens = new Map();
    // The section heading is counted twice: a heading match should outrank an
    // incidental body match for the same term.
    for (const token of tokenize(`${chunk.section} ${chunk.section} ${chunk.content}`)){
        tokens.set(token, (tokens.get(token) ?? 0) + 1);
    }
    let length = 0;
    for (const count of tokens.values())length += count;
    return {
        chunk,
        tokens,
        length
    };
}
const K1 = 1.4;
const B = 0.72;
function searchMarkdownRag(chunks, query, topK = 4, minScore = 0.005) {
    const queryTokens = [
        ...new Set(tokenize(query))
    ];
    if (queryTokens.length === 0 || chunks.length === 0) return [];
    const index = chunks.map(buildIndex);
    const avgLength = index.reduce((sum, doc)=>sum + doc.length, 0) / index.length || 1;
    const documentFrequency = new Map();
    for (const token of queryTokens){
        let df = 0;
        for (const doc of index)if (doc.tokens.has(token)) df += 1;
        documentFrequency.set(token, df);
    }
    const scored = index.map((doc)=>{
        let score = 0;
        for (const token of queryTokens){
            const tf = doc.tokens.get(token) ?? 0;
            if (tf === 0) continue;
            const df = documentFrequency.get(token) ?? 0;
            const idf = Math.log(1 + (index.length - df + 0.5) / (df + 0.5));
            const norm = 1 - B + B * (doc.length / avgLength);
            score += idf * (tf * (K1 + 1) / (tf + K1 * norm));
        }
        return {
            id: doc.chunk.id,
            section: doc.chunk.section,
            content: doc.chunk.content,
            score: Number(score.toFixed(4))
        };
    });
    return scored.filter((hit)=>hit.score >= minScore).sort((a, b)=>b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(1, topK));
}
function retrievalConfidence(query, chunks) {
    const queryTokens = [
        ...new Set(tokenize(query))
    ].filter((token)=>token.length > 2);
    if (queryTokens.length === 0 || chunks.length === 0) return 0;
    const tokenSet = (chunk)=>new Set(tokenize(`${chunk.section} ${chunk.content}`));
    const topTokens = tokenSet(chunks[0]);
    const unionTokens = new Set();
    for (const chunk of chunks.slice(0, 3)){
        for (const token of tokenSet(chunk))unionTokens.add(token);
    }
    const matched = queryTokens.filter((token)=>unionTokens.has(token));
    // One shared token is a coincidence, not an answer.
    if (matched.length < 2 && queryTokens.length > 1) return Math.min(35, matched.length * 20);
    const topMatched = queryTokens.filter((token)=>topTokens.has(token));
    const unionCoverage = matched.length / queryTokens.length;
    const topCoverage = topMatched.length / queryTokens.length;
    return Math.max(0, Math.min(95, Math.round(100 * Math.min(1, 0.95 * unionCoverage + 0.35 * topCoverage))));
}
function bestSentences(query, content, limit = 2) {
    const queryTokens = new Set(tokenize(query));
    const sentences = content.split(/(?<=[.!?])\s+|\n+/).map((sentence)=>sentence.replace(/^[-*•]\s*/, "").trim()).filter((sentence)=>sentence.length > 0);
    const scored = sentences.map((sentence, position)=>{
        const tokens = new Set(tokenize(sentence));
        let overlap = 0;
        for (const token of queryTokens)if (tokens.has(token)) overlap += 1;
        return {
            sentence,
            position,
            overlap
        };
    });
    const best = scored.filter((entry)=>entry.overlap > 0).sort((a, b)=>b.overlap - a.overlap || a.position - b.position).slice(0, limit).sort((a, b)=>a.position - b.position).map((entry)=>entry.sentence);
    return (best.length > 0 ? best : sentences.slice(0, limit)).join(" ");
}
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
"[project]/src/app/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0lp_64a79-uhp._.js.map