import { test } from "@playwright/test";

test("debug duplicate render", async ({ page }) => {
  const html = await (await page.request.get("/markets")).text();
  console.log("DEBUG server html integrity count:", (html.match(/aria-label="Integrity"/g) || []).length, "len", html.length);
  await page.goto("/markets");
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() =>
    Array.from(document.querySelectorAll('select[name="integrity"]')).map((el) => {
      const chain: string[] = [];
      let n: Element | null = el;
      for (let i = 0; i < 14 && n; i++, n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.hasAttribute("hidden") ? "[hidden]" : ""}.${(n.getAttribute("class") || "").slice(0, 40)}`);
      return { visible: (el as HTMLElement).offsetParent !== null, chain };
    }),
  );
  console.log("DEBUG dom:", JSON.stringify(info, null, 1));
  console.log("DEBUG mains:", await page.locator("main").count(), "asides:", await page.locator("aside").count());
});
