import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  // Local visual preview only: no account, cloud requests or business writes.
  if (pathname === "/__preview-diy.html") {
    let html = readFileSync(resolve(root, "P2_捏脸DIY.html"), "utf8");
    const start = html.indexOf("(async function loadCloudAppearance(){");
    const end = html.indexOf("document.getElementById('shareBtn').addEventListener", start);
    if (start < 0 || end < 0) {
      response.writeHead(500); response.end("Preview markers missing"); return;
    }
    html = html.slice(0, start) + html.slice(end);
    html = html.replace(' diy-guarding" aria-busy="true"', '" aria-busy="false"')
      .replace('<script src="scripts/xqx-auth.js"></script>', '')
      .replace('id="saveBtn"', 'id="saveBtn" disabled title="本地预览不保存到账号"')
      .replace('id="shareBtn"', 'id="shareBtn" disabled')
      .replace('· 已自动保存', '· 本地预览，不写入账号')
      .replace('id="p2-points">--', 'id="p2-points">预览');
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html); return;
  }
  const requested = pathname === "/" ? "P1_首页.html" : pathname.replace(/^[/\\]+/, "");
  const file = resolve(root, requested);

  if (!(file === root || file.startsWith(`${root}${sep}`)) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`小确闲开发服务器已启动：http://localhost:${port}`);
  console.log("根地址 / 已固定打开 P1_首页.html");
});
