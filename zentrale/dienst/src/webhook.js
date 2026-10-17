// A7 / H2 – Webhook-Empfang, z. B. von aPager PRO.
//   POST|GET http://<zentrale>:8080/alarm/<geheimnis>?who=<kennung>&keyword=..&unit=..
// aPager sendet Stichwort und Einheit als Query oder JSON ({ keyword, unit }).
import { createServer } from "node:http";

export function startWebhook(ctx, log) {
  const port = Number(process.env.WEBHOOK_PORT || 8080);
  createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const [, route, secret] = url.pathname.split("/");
    if (route !== "alarm") return end(res, 404, "nicht gefunden");
    if (!ctx.config.webhookSecret || secret !== ctx.config.webhookSecret) {
      log.warn("Webhook mit falschem Schlüssel abgelehnt");
      return end(res, 403, "falscher Schlüssel");
    }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on("end", () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch { /* kein JSON */ }
      const who = url.searchParams.get("who") || json.who || ctx.config.persons?.[0]?.id || "ich";
      const payload = {
        source: "Webhook",
        keyword: url.searchParams.get("keyword") || json.keyword || "",
        unit: url.searchParams.get("unit") || json.unit || "",
      };
      ctx.client.publish(`alarm/${who}`, JSON.stringify(payload), { qos: 1 });
      log.ok("Webhook empfangen", `${who} · ${payload.keyword || "ohne Stichwort"}`);
      end(res, 200, "ok");
    });
  }).listen(port, () => log.info("Webhook bereit", `Port ${port}`));
}

function end(res, code, text) {
  res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}
