// Compile KJP GEAR contracts. solc resolved locally, else from the cashcat
// checkout that has historically supplied it (house pattern).
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let solc;
try { solc = createRequire(import.meta.url)("solc"); }
catch {
  const from = process.env.SOLC_FROM || "C:/Users/Bia/New folder/cashcat-printer/";
  try { solc = createRequire(from)("solc"); }
  catch {
    console.error("solc not found — npm i -D solc, or SOLC_FROM=<checkout> node tools/compile-gear.mjs");
    process.exit(1);
  }
}

const files = ["KJPGear.sol", "TestMocksGear.sol"];
const sources = {};
for (const f of files) sources[f] = { content: readFileSync(join(root, "contracts", f), "utf8") };

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
let fatal = false;
for (const e of out.errors || []){
  if (e.severity === "error"){ fatal = true; console.error(e.formattedMessage); }
}
if (fatal) process.exit(1);
mkdirSync(join(root, "out"), { recursive: true });
for (const f of files){
  for (const [cname, c] of Object.entries(out.contracts[f] || {})){
    writeFileSync(join(root, "out", cname + ".json"), JSON.stringify({
      abi: c.abi, bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object
    }));
    const kb = (c.evm.deployedBytecode.object.length / 2 / 1024).toFixed(1);
    console.log("✓ " + cname + "  (" + kb + " KB deployed)");
  }
}
