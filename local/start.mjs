import { spawn } from "node:child_process";
import process from "node:process";
const child = spawn(process.execPath, ["node_modules/@react-router/dev/bin.cjs", "dev", "--host", "127.0.0.1", "--port", "5192", "--strictPort"], { stdio: "inherit", env: { ...process.env, VENI_LOCAL_BOOTSTRAP: "1", SUPABASE_EXPERIMENTAL_STACK: "0" } });
child.on("exit", code => { process.exitCode = code ?? 1; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
