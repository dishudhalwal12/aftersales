module.exports = [
(()=>{"use strict";return[
"[project]/src/app/dashboard/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardPage,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$llm$2d$orchestrator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/llm-orchestrator.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$sarvam$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/sarvam.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/auth/actions.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/DashboardShell.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$LiveQueuePanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/LiveQueuePanel.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$VoiceTestPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/VoiceTestPanel.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$BrainInsightsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/BrainInsightsPanel.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ChannelsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/ChannelsPanel.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/dashboard/actions.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
const dynamic = "force-dynamic";
const TABS = new Set([
    "queue",
    "voice",
    "brain",
    "channels"
]);
async function DashboardPage({ searchParams }) {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getCurrentUser"])();
    if (!user) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/auth");
    const rows = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].business.findMany({
        where: {
            ownerId: user.id
        },
        orderBy: {
            createdAt: "asc"
        },
        select: {
            id: true,
            name: true,
            businessType: true,
            brainVersion: true,
            autoSendEnabled: true,
            _count: {
                select: {
                    chunks: true,
                    tickets: true
                }
            }
        }
    });
    if (rows.length === 0) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/onboarding");
    const businesses = rows.map((row)=>({
            businessId: row.id,
            name: row.name,
            businessType: row.businessType,
            brainVersion: row.brainVersion,
            autoSendEnabled: row.autoSendEnabled,
            chunkCount: row._count.chunks,
            ticketCount: row._count.tickets
        }));
    const params = await searchParams;
    const requestedBusiness = typeof params["business"] === "string" ? params["business"] : "";
    const activeBusiness = businesses.find((business)=>business.businessId === requestedBusiness) ?? businesses[0];
    if (!activeBusiness) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/onboarding");
    const requestedTab = typeof params["tab"] === "string" ? params["tab"] : "queue";
    const tab = TABS.has(requestedTab) ? requestedTab : "queue";
    const queueCount = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].ticket.count({
        where: {
            businessId: activeBusiness.businessId,
            state: {
                not: "closed"
            }
        }
    });
    const provider = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$llm$2d$orchestrator$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resolveProvider"])({
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY
    });
    const degraded = provider === "heuristic";
    const providerLabel = degraded ? "offline retrieval classifier — no model key configured" : `openrouter · ${process.env.LLM_MODEL_ID ?? "default model"}`;
    const voice = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$sarvam$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["sarvamStatus"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["DashboardShell"], {
        businesses: businesses,
        activeBusiness: activeBusiness,
        tab: tab,
        user: {
            name: user.name,
            email: user.email
        },
        providerLabel: providerLabel,
        degraded: degraded,
        queueCount: queueCount,
        resetAction: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$dashboard$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["resetDemoAction"],
        signOutAction: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$auth$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["signOutAction"],
        children: [
            tab === "queue" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$LiveQueuePanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["LiveQueuePanel"], {
                businessId: activeBusiness.businessId
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.tsx",
                lineNumber: 89,
                columnNumber: 27
            }, this),
            tab === "voice" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$VoiceTestPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["VoiceTestPanel"], {
                businessId: activeBusiness.businessId,
                businessName: activeBusiness.name,
                sarvamConfigured: voice.configured
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.tsx",
                lineNumber: 91,
                columnNumber: 9
            }, this),
            tab === "brain" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$BrainInsightsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["BrainInsightsPanel"], {
                businessId: activeBusiness.businessId
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.tsx",
                lineNumber: 97,
                columnNumber: 27
            }, this),
            tab === "channels" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ChannelsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ChannelsPanel"], {
                businessId: activeBusiness.businessId,
                sarvamConfigured: voice.configured,
                virtualNumber: voice.virtualNumber
            }, void 0, false, {
                fileName: "[project]/src/app/dashboard/page.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/dashboard/page.tsx",
        lineNumber: 78,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/dashboard/BrainInsightsPanel.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BrainInsightsPanel",
    ()=>BrainInsightsPanel
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const BrainInsightsPanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call BrainInsightsPanel() from the server but BrainInsightsPanel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/dashboard/BrainInsightsPanel.tsx", "BrainInsightsPanel");
}),
"[project]/src/components/dashboard/BrainInsightsPanel.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$BrainInsightsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/BrainInsightsPanel.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$BrainInsightsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/dashboard/ChannelsPanel.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChannelsPanel",
    ()=>ChannelsPanel
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const ChannelsPanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call ChannelsPanel() from the server but ChannelsPanel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/dashboard/ChannelsPanel.tsx", "ChannelsPanel");
}),
"[project]/src/components/dashboard/ChannelsPanel.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ChannelsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/ChannelsPanel.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ChannelsPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/dashboard/DashboardShell.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DashboardShell",
    ()=>DashboardShell
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const DashboardShell = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call DashboardShell() from the server but DashboardShell is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/dashboard/DashboardShell.tsx", "DashboardShell");
}),
"[project]/src/components/dashboard/DashboardShell.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/DashboardShell.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/dashboard/LiveQueuePanel.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LiveQueuePanel",
    ()=>LiveQueuePanel
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const LiveQueuePanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call LiveQueuePanel() from the server but LiveQueuePanel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/dashboard/LiveQueuePanel.tsx", "LiveQueuePanel");
}),
"[project]/src/components/dashboard/LiveQueuePanel.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$LiveQueuePanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/LiveQueuePanel.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$LiveQueuePanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/dashboard/VoiceTestPanel.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "VoiceTestPanel",
    ()=>VoiceTestPanel
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const VoiceTestPanel = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call VoiceTestPanel() from the server but VoiceTestPanel is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/dashboard/VoiceTestPanel.tsx", "VoiceTestPanel");
}),
"[project]/src/components/dashboard/VoiceTestPanel.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$VoiceTestPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/VoiceTestPanel.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$VoiceTestPanel$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
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
"[project]/src/lib/sarvam.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildCallVariables",
    ()=>buildCallVariables,
    "generateDemoPin",
    ()=>generateDemoPin,
    "placeOutboundCall",
    ()=>placeOutboundCall,
    "sarvamStatus",
    ()=>sarvamStatus
]);
/**
 * Sarvam AI voice client.
 *
 * Two honest modes:
 *   live    — SARVAM_API_KEY + SARVAM_CALL_ENDPOINT set; a real outbound call is placed.
 *   dry_run — either is missing: no call is placed, nothing is faked, and the
 *             reason is returned to the caller and shown in the panel.
 *
 * The endpoint is configuration, not an invented constant: Sarvam's outbound-call
 * URL comes from the account that owns the rented number.
 */ var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
function sarvamStatus() {
    const apiKey = (process.env.SARVAM_API_KEY ?? "").trim();
    const endpoint = (process.env.SARVAM_CALL_ENDPOINT ?? "").trim();
    const virtualNumber = (process.env.SARVAM_VIRTUAL_NUMBER ?? "").trim();
    if (apiKey.length === 0) {
        return {
            configured: false,
            virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
            endpointConfigured: endpoint.length > 0,
            reason: "SARVAM_API_KEY is not set — the voice panel runs as a dry run and places no call."
        };
    }
    if (endpoint.length === 0) {
        return {
            configured: false,
            virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
            endpointConfigured: false,
            reason: "SARVAM_CALL_ENDPOINT is not set — the outbound-call URL comes from your Sarvam account."
        };
    }
    return {
        configured: true,
        virtualNumber: virtualNumber.length > 0 ? virtualNumber : null,
        endpointConfigured: true,
        reason: "Sarvam credentials present — outbound calls will be placed."
    };
}
function generateDemoPin() {
    return String((0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomInt"])(1000, 10000));
}
async function placeOutboundCall(input) {
    const status = sarvamStatus();
    if (!status.configured) {
        return {
            mode: "dry_run",
            ok: true,
            interactionId: null,
            reason: status.reason
        };
    }
    try {
        const response = await fetch((process.env.SARVAM_CALL_ENDPOINT ?? "").trim(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-subscription-key": (process.env.SARVAM_API_KEY ?? "").trim()
            },
            body: JSON.stringify({
                phone_number: input.phone,
                agent_id: (process.env.SARVAM_AGENT_ID ?? "").trim() || undefined,
                metadata: {
                    session_id: input.sessionId,
                    business_name: input.businessName,
                    demo_pin: input.demoPin,
                    ...input.variables
                }
            }),
            signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) {
            return {
                mode: "live",
                ok: false,
                interactionId: null,
                reason: `Sarvam call API returned HTTP ${response.status}`
            };
        }
        const body = await response.json();
        const interactionId = typeof body["interaction_id"] === "string" ? body["interaction_id"] : typeof body["id"] === "string" ? body["id"] : null;
        return {
            mode: "live",
            ok: true,
            interactionId,
            reason: "Outbound call requested."
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "call request failed";
        return {
            mode: "live",
            ok: false,
            interactionId: null,
            reason: message
        };
    }
}
function buildCallVariables(business) {
    return {
        business_id: business.id,
        business_name: business.name,
        business_type: business.businessType,
        agent_tone: business.agentTone,
        escalation_phone: business.escalationPhone,
        tool_search_url: `${(process.env.PUBLIC_WEBHOOK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/voice/sarvam-tool-search`
    };
}
}),
]})(),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/app/dashboard/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/dashboard/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__20n-aibvpuula._.js.map