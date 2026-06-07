import fs from "node:fs";

const requiredFiles = [
  "packages/shared/src/dsl.ts",
  "packages/shared/src/expression.ts",
  "apps/api/src/app.ts",
  "apps/api/src/services/executor.ts"
];

const keywords = ["中文", "secret", "签名", "表达式", "重试", "状态机"];
let failed = false;

for (const file of requiredFiles) {
  const content = fs.readFileSync(file, "utf8");
  const hasChineseComment = /\/\/.*[\u4e00-\u9fa5]/.test(content);
  if (!hasChineseComment) {
    console.error(`${file} 缺少中文注释`);
    failed = true;
  }
}

const all = requiredFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const keyword of keywords) {
  if (!all.includes(keyword)) {
    console.error(`关键说明缺少：${keyword}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("中文注释检查通过");
