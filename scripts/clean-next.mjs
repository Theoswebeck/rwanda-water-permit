import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function rmDirIfExists(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (e) {
    // Ignore; force:true should handle most cases, but we still don't want to hard-fail dev startup.
  }
}

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");

rmDirIfExists(nextDir);
console.log("Cleaned .next cache");



