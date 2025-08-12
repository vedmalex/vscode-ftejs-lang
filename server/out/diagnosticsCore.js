"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiagnosticsFromText = computeDiagnosticsFromText;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const astUtils_1 = require("./astUtils");
function computeDiagnosticsFromText(text, workspaceRoots = []) {
    const diags = [];
    // Unmatched end: more end tags than opened
    try {
        const openRe = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+?)\2\s*:\s*-?\s*#>/g;
        const endRe = /<#\s*-?\s*end\s*-?\s*#>/g;
        let opens = 0;
        let ends = 0;
        while (openRe.exec(text))
            opens += 1;
        while (endRe.exec(text))
            ends += 1;
        if (ends > opens) {
            diags.push({ severity: 'error', message: 'Unmatched end' });
        }
    }
    catch { }
    // Duplicate block/slot declarations
    try {
        const seen = {};
        const kind = {};
        const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
        let d;
        while ((d = rxDecl.exec(text))) {
            const name = d[3];
            seen[name] = (seen[name] || 0) + 1;
            kind[name] = d[1];
        }
        for (const n of Object.keys(seen)) {
            if (seen[n] > 1) {
                diags.push({ severity: 'warning', message: `Duplicate ${kind[n]} declaration: ${n}` });
            }
        }
    }
    catch { }
    // Unknown content('name') references
    try {
        const declared = new Set();
        const rxDecl = /<#\s*-?\s*(block|slot)\s+(['"`])([^'"`]+)\2\s*:\s*-?\s*#>/g;
        let d;
        while ((d = rxDecl.exec(text))) {
            declared.add(d[3]);
        }
        const rxUse = /content\(\s*(["'`])([^"'`]+)\1/g;
        let m;
        while ((m = rxUse.exec(text))) {
            const name = m[2];
            if (!declared.has(name)) {
                diags.push({ severity: 'warning', message: `Unknown block name: ${name}` });
            }
        }
    }
    catch { }
    // Unresolved partial alias/path
    try {
        const rp = /partial\(\s*[^,]+,\s*(["'`])([^"'`]+)\1/g;
        let m;
        while ((m = rp.exec(text))) {
            const key = m[2];
            const bases = [...workspaceRoots, ...workspaceRoots.map(r => path.join(r, 'templates'))];
            const exists = (rel) => {
                for (const base of bases) {
                    const p = path.isAbsolute(rel) ? rel : path.join(base, rel);
                    const variants = (0, astUtils_1.getTemplatePathVariants)(p);
                    for (const v of variants) {
                        if (fs.existsSync(v))
                            return true;
                    }
                }
                return false;
            };
            if (!exists(key)) {
                diags.push({ severity: 'warning', message: `Unresolved partial: ${key}` });
            }
        }
    }
    catch { }
    return diags;
}
