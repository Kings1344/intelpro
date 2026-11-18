import { test } from "@playwright/test";

test("debug duplicate render", async ({ page }) => {
  page.on("console", (m) => console.log("DEBUG console", m.type(), m.text().slice(0, 300)));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("DEBUG nav", f.url()); });
  page.on("request", (r) => { if (r.resourceType() === "fetch" || r.resourceType() === "document") console.log("DEBUG req", r.method(), r.url().slice(0, 160), JSON.stringify(r.headers()["rsc"] ?? "")); });
  await page.goto("/markets", { waitUntil: "commit" });
  const samples: string[] = [];
  for (let i = 0; i < 50; i++) {
    const c = await page.evaluate(() => [document.querySelectorAll('select[name="integrity"]').length, document.querySelectorAll("main").length, document.readyState].join("/")).catch(() => "err");
    samples.push(c);
    await page.waitForTimeout(40);
  }
  console.log("DEBUG samples", samples.join(" "));
});
