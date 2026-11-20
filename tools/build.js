import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "extension");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));

async function list(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await list(path.join(dir, entry.name), name + "/"));
    else files.push(name);
  }
  return files.sort();
}

const files = await list(source);
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", path.join(source, file)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}
const references = [manifest.action.default_popup, manifest.background.service_worker,
  ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((script) => script.js)];
for (const reference of references) {
  if (!files.includes(reference)) throw new Error(`manifest 引用文件不存在：${reference}`);
}

// 生成不压缩 ZIP，避免为小型静态扩展引入构建依赖；使用标准 CRC32 校验。
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const entries = [];
const directory = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file);
  const data = await readFile(path.join(source, file));
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(0x21, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  header.copy(central, 6, 4, 30);
  central.writeUInt32LE(offset, 42);
  entries.push(header, name, data);
  directory.push(central, name);
  offset += header.length + name.length + data.length;
}
const centralData = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralData.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(dist, { recursive: true });
const unpacked = path.resolve(dist, "unpacked");
if (path.dirname(unpacked) !== path.resolve(root, "dist")) throw new Error("生成目录超出预期范围");
await rm(unpacked, { recursive: true, force: true });
await cp(source, unpacked, { recursive: true });
const zipPath = path.join(dist, `sanrenjz-video-speed-${manifest.version}.zip`);
await writeFile(zipPath, Buffer.concat([...entries, centralData, end]));
console.log(`已检查 ${files.length} 个文件，生成：\n${path.join(dist, "unpacked")}\n${zipPath}`);
