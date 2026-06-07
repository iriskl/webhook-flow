import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:../data/dev.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("当前初始化脚本只支持 SQLite file: DATABASE_URL");
}

const dbPath = path.resolve("prisma", databaseUrl.slice("file:".length));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const migration = fs.readFileSync("prisma/migrations/20260605122000_init/migration.sql", "utf8");
execFileSync("sqlite3", [dbPath], { input: migration, stdio: ["pipe", "inherit", "inherit"] });
console.log(`SQLite 数据库已初始化：${dbPath}`);
