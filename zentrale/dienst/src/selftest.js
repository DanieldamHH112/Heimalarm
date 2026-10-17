// I4 – Wöchentlicher Selbsttest (Sonntag 10:00): prüft ESP32, Apps, Zigbee
// und veröffentlicht einen Bericht retained auf heimalarm/report.
export function startSelftest(ctx, log) {
  const run = () => {
    const esp = Object.entries(ctx.esp).map(([who, s]) => ({ name: `ESP32 ${who}`, ok: s.online }));
    const apps = Object.values(ctx.clients).filter((c) => c.online).length;
    const checks = [
      { name: "Zentrale-Dienst", ok: true },
      ...(esp.length ? esp : [{ name: "ESP32", ok: false, hint: "kein ESP32 gemeldet" }]),
      { name: "Apps verbunden", ok: apps > 0, hint: `${apps} online` },
      { name: "Zigbee2MQTT", ok: ctx.bridge === "online", hint: ctx.bridge ? String(ctx.bridge) : "nicht gefunden" },
    ];
    const report = { ts: Date.now(), ok: checks.every((c) => c.ok), checks };
    ctx.client.publish("heimalarm/report", JSON.stringify(report), { retain: true, qos: 1 });
    (report.ok ? log.ok : log.warn)("Wöchentlicher Selbsttest", report.ok ? "alles in Ordnung" : checks.filter((c) => !c.ok).map((c) => c.name).join(", "));
  };
  setInterval(() => {
    const d = new Date();
    if (d.getDay() === 0 && d.getHours() === 10 && d.getMinutes() === 0) run();
  }, 60e3);
  ctx.client.on("message", (topic) => { if (topic === "heimalarm/cmd/selftest") run(); });
}
