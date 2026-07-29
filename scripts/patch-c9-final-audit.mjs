#!/usr/bin/env node
/** PATCH C.9 — final audit entrypoint */
import { execSync } from "node:child_process";
execSync("node scripts/test-mia-analytics-phase-c-final-audit.js", { stdio: "inherit" });
