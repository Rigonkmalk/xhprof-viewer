// Regenerates docs/img/*.png from the built-in demo profile.
//
//   npm i puppeteer-core && node docs/screenshots.js
//
// Drives the local Chrome install headlessly, loads the demo profile, walks
// every tab, and crops each shot to its real content height. Adjust CHROME if
// your browser lives elsewhere.

const puppeteer = require("puppeteer-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FILE = "file://" + require("path").resolve(__dirname, "..", "xhprof-viewer.html");
const OUT = require("path").resolve(__dirname, "img");
const W = 1440;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: 900, deviceScaleFactor: 2 });

  // Fit the viewport to the page content (bounded), so no dead space at the bottom.
  // Fit the viewport to the real content height: the layout stretches its
  // containers to the viewport, so measure leaf elements only.
  async function shot(name, sel, { min = 400, max = 3400 } = {}) {
    const h = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      let bottom = 0;
      root.querySelectorAll("*").forEach((el) => {
        if (el.children.length) return;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) bottom = Math.max(bottom, r.bottom + window.scrollY);
      });
      return Math.ceil(bottom) + 24;
    }, sel);
    await page.setViewport({ width: W, height: Math.max(min, Math.min(h, max)), deviceScaleFactor: 2 });
    await sleep(300);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.setViewport({ width: W, height: 900, deviceScaleFactor: 2 });
    await sleep(150);
  }

  await page.goto(FILE, { waitUntil: "load" });
  await sleep(300);

  // 1. Landing: drag & drop zone
  await shot("01-drop", "#drop", { min: 600, max: 760 });

  await page.click("#demoBtn");
  await sleep(600);

  // 2. Flat profile
  await shot("02-flat", "#app");

  // 3. Call tree, expanded three levels deep
  await page.click('.tab[data-view="tree"]');
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      document.querySelectorAll("#tree .tk").forEach((b) => {
        if (b.textContent.trim() === "▸") b.click();
      });
    });
    await sleep(250);
  }
  await shot("03-tree", "#app");

  // 4. Flame graph
  await page.click('.tab[data-view="flame"]');
  await sleep(500);
  await shot("04-flame", "#app", { min: 445 });

  // 5. Insights
  await page.click('.tab[data-view="insight"]');
  await sleep(400);
  await shot("05-insights", "#app");

  // 6. Detail panel, opened from a row of the flat profile
  await page.click('.tab[data-view="flat"]');
  await sleep(300);
  await page.evaluate(() => document.querySelectorAll("#flat tbody tr")[0].click());
  await sleep(400);
  await shot("06-detail", "#app", { max: 1500 });
  await page.keyboard.press("Escape");
  await sleep(200);

  // 7. Info tab
  await page.click('.tab[data-view="info"]');
  await sleep(300);
  await shot("07-info", "#app", { max: 1900 });

  // 8. Light theme + name filter on the flat profile
  await page.click('.tab[data-view="flat"]');
  await page.click("#themeBtn");
  await page.type("#q", "PDO|Repository|Hydrator");
  await sleep(500);
  await shot("08-light-filter", "#app", { min: 400 });

  // 9. Diff against a baseline: same demo profile with a few edges made cheaper,
  // loaded through the baseline path so the Diff tab appears.
  await page.click("#themeBtn");
  await page.evaluate(() => { document.querySelector("#q").value = ""; document.querySelector("#q").oninput(); });
  await sleep(300);
  await page.evaluate(async () => {
    const base = JSON.parse(JSON.stringify(window.DEMO_PROFILE));
    base["Repository::findAll==>PDO::query"].wt *= 2.4;
    base["Repository::findAll==>Hydrator::hydrate"].ct = 2400;
    base["Repository::findAll==>Hydrator::hydrate"].wt *= 2;
    delete base["Twig::render==>htmlspecialchars"];
    base["main()==>legacy_bootstrap"] = { ct: 1, wt: 42000, cpu: 41000, mu: 90000, pmu: 100000 };
    await load(JSON.stringify(base), "before-optimisation.json", { baseline: true });
  });
  await sleep(400);
  await page.click('.tab[data-view="diff"]');
  await sleep(400);
  await shot("09-diff", "#app", { max: 1600 });

  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
