#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parseArgs(argv) {
  const args = {
    format: "text",
    screenshotDir: "",
    target: "",
    viewport: "both",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--") && !args.target) {
      args.target = token;
      continue;
    }
    if (token === "--format") {
      args.format = argv[i + 1] || "text";
      i += 1;
      continue;
    }
    if (token === "--viewport") {
      args.viewport = argv[i + 1] || "both";
      i += 1;
      continue;
    }
    if (token === "--screenshot-dir") {
      args.screenshotDir = argv[i + 1] || "";
      i += 1;
    }
  }

  if (!args.target) {
    throw new Error("Usage: node audit_frontend_runtime.mjs <path-or-url> [--viewport desktop|mobile|both] [--format text|json] [--screenshot-dir <dir>]");
  }
  if (!["text", "json"].includes(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`);
  }
  if (!["desktop", "mobile", "both"].includes(args.viewport)) {
    throw new Error(`Unsupported viewport: ${args.viewport}`);
  }
  return args;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function ensureDir(dirPath) {
  if (!dirPath) {
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    const resolvedPath = path.resolve(rootDir, `.${requested}`);
    if (!resolvedPath.startsWith(path.resolve(rootDir))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let filePath = resolvedPath;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

async function resolveTarget(rawTarget) {
  if (isHttpUrl(rawTarget)) {
    return { url: rawTarget, cleanup: null };
  }

  const absolute = path.resolve(rawTarget);
  const stat = fs.statSync(absolute);
  const rootDir = stat.isDirectory() ? absolute : path.dirname(absolute);
  const entry = stat.isDirectory() ? "/index.html" : `/${path.basename(absolute)}`;
  const server = await startStaticServer(rootDir);
  return {
    url: `${server.baseUrl}${entry}`,
    cleanup: server.close,
  };
}

function getViewportList(mode) {
  if (mode === "both") {
    return Object.entries(VIEWPORTS);
  }
  return [[mode, VIEWPORTS[mode]]];
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function summarizeViewport(result) {
  const status = result.signals.some((item) => item.severity === "fail")
    ? "fail"
    : result.signals.some((item) => item.severity === "warn")
      ? "warn"
      : "pass";
  return { ...result, status };
}

function printText(report) {
  console.log(`TARGET ${report.target}`);
  if (report.screenshotDir) {
    console.log(`SCREENSHOTS ${report.screenshotDir}`);
  }
  for (const viewport of report.viewports) {
    console.log(`VIEWPORT ${viewport.name} ${viewport.width}x${viewport.height} ${viewport.status.toUpperCase()}`);
    console.log(`  main_stage_ratio=${formatPercent(viewport.metrics.mainStageViewportRatio)}`);
    console.log(`  hero_ratio=${formatPercent(viewport.metrics.heroViewportRatio)}`);
    console.log(`  side_rail_ratio=${formatPercent(viewport.metrics.sideRailViewportRatio)}`);
    console.log(`  side_rail_content_density=${formatPercent(viewport.metrics.sideRailContentDensity)}`);
    console.log(`  sparse_right_columns=${viewport.metrics.sparseRightColumnCount}`);
    console.log(`  visible_large_surfaces=${viewport.metrics.visibleLargeSurfaceCount}`);
    console.log(`  below_fold_secondary_surfaces=${viewport.metrics.belowFoldSecondaryCount}`);
    console.log(`  below_fold_anchor_jumps=${viewport.metrics.belowFoldAnchorJumpCount}`);
    console.log(`  summary_cards_visible=${viewport.metrics.visibleSummaryCardCount}`);
    console.log(`  disclosure_effective=${viewport.metrics.effectiveDisclosure ? "yes" : "no"}`);
    if (viewport.screenshotPath) {
      console.log(`  screenshot=${viewport.screenshotPath}`);
    }
    if (!viewport.signals.length) {
      console.log("  signals=none");
      continue;
    }
    for (const signal of viewport.signals) {
      console.log(`  [${signal.severity.toUpperCase()}] ${signal.id}: ${signal.message}`);
    }
  }
  console.log(`SUMMARY pass=${report.summary.pass} warn=${report.summary.warn} fail=${report.summary.fail}`);
}

async function analyzePage(page, viewportName) {
  return page.evaluate((activeViewport) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportArea = viewportWidth * viewportHeight;

    const selectors = {
      mainStage: [
        ".main-stage",
        "[data-main-stage]",
        "[data-primary-surface]",
        ".primary-stage",
        ".workbench",
        ".canvas",
        "#cashflow-stage",
      ],
      hero: [
        ".intro-panel",
        ".hero",
        ".hero-panel",
        ".summary-panel",
        ".editorial-panel",
      ],
      sideRail: [
        ".ledger-panel",
        ".sidebar",
        ".side-rail",
        ".rail",
        "aside",
      ],
      summaryCards: [
        ".metric-card",
        ".summary-card",
        ".kpi-card",
        ".stats-card",
      ],
      secondarySections: [
        ".budget-board",
        ".insight-band",
        ".insight-card",
        ".secondary-section",
        "[id*='budget']",
        "[id*='insight']",
        "[id*='details']",
      ],
      disclosureControls: [
        "[role='tablist']",
        "[role='tabpanel']",
        "[aria-expanded]",
        "[data-state]",
        "[data-collapsed]",
      ],
      controlledPanels: [
        "[role='tabpanel']",
        "[data-panel]",
        "[data-view]",
        "[data-period-panel]",
        "[data-state='closed']",
        "[data-collapsed='true']",
      ],
      jumpControls: [
        "a[href^='#']",
        "button[data-scroll-target]",
        "[data-jump-target]",
        "[data-scroll-to]",
      ],
    };

    function getVisibleMetrics(element) {
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const visibleArea = width * height;
      const totalArea = Math.max(0, rect.width * rect.height);
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        visibleArea,
        viewportRatio: viewportArea ? visibleArea / viewportArea : 0,
        selfVisibleRatio: totalArea ? visibleArea / totalArea : 0,
      };
    }

    function firstMetric(selectorList) {
      for (const selector of selectorList) {
        const node = document.querySelector(selector);
        if (!node) {
          continue;
        }
        const metric = getVisibleMetrics(node);
        if (metric) {
          return metric;
        }
      }
      return null;
    }

    function collectLargeSurfaces() {
      const candidates = Array.from(document.querySelectorAll("main section, main article, main aside, main > div"));
      return candidates
        .map((node) => ({ node, metric: getVisibleMetrics(node) }))
        .filter((item) => item.metric && item.metric.viewportRatio >= 0.08);
    }

    function estimateSideRailContentDensity(sideRailNode, railMetric) {
      if (!sideRailNode || !railMetric || railMetric.visibleArea <= 0) {
        return { density: 0, interactiveCount: 0 };
      }

      const candidateBlocks = Array.from(sideRailNode.querySelectorAll(":scope > *, :scope > * > *"));
      const meaningfulBlocks = candidateBlocks
        .map((node) => {
          const metric = getVisibleMetrics(node);
          if (!metric || metric.visibleArea <= 0) {
            return null;
          }
          const textLength = (node.textContent || "").replace(/\s+/g, "").length;
          const interactiveCount = node.querySelectorAll("button, a, input, select, textarea, [role='button']").length;
          const graphicCount = node.querySelectorAll("svg, canvas, img").length;
          const meaningful =
            textLength >= 12 ||
            interactiveCount > 0 ||
            graphicCount > 0 ||
            metric.visibleArea >= railMetric.visibleArea * 0.1;
          if (!meaningful) {
            return null;
          }
          return { metric, interactiveCount };
        })
        .filter(Boolean);

      const occupiedArea = meaningfulBlocks.reduce((sum, item) => sum + item.metric.visibleArea, 0);
      const density = Math.min(1, occupiedArea / railMetric.visibleArea);
      const interactiveCount = meaningfulBlocks.reduce((sum, item) => sum + item.interactiveCount, 0);
      return { density, interactiveCount };
    }

    function collectSparseRightColumns() {
      const candidates = Array.from(document.querySelectorAll("main section, main article, main aside, main div"));
      return candidates
        .map((node) => {
          const metric = getVisibleMetrics(node);
          if (!metric || metric.visibleArea <= 0) {
            return null;
          }
          const isRightColumn =
            metric.left >= viewportWidth * 0.52 &&
            metric.width >= viewportWidth * 0.16 &&
            metric.height >= viewportHeight * 0.22 &&
            metric.viewportRatio >= 0.05;
          if (!isRightColumn) {
            return null;
          }

          const directBlocks = Array.from(node.children)
            .map((child) => {
              const childMetric = getVisibleMetrics(child);
              if (!childMetric || childMetric.visibleArea <= 0) {
                return null;
              }
              const textLength = (child.textContent || "").replace(/\s+/g, "").length;
              const interactiveCount = child.querySelectorAll("button, a, input, select, textarea, [role='button']").length;
              const graphicCount = child.querySelectorAll("svg, canvas, img").length;
              const meaningful =
                textLength >= 10 ||
                interactiveCount > 0 ||
                graphicCount > 0 ||
                childMetric.visibleArea >= metric.visibleArea * 0.08;
              if (!meaningful) {
                return null;
              }
              return { childMetric, interactiveCount };
            })
            .filter(Boolean);

          const textLength = (node.textContent || "").replace(/\s+/g, "").length;
          const interactiveCount = node.querySelectorAll("button, a, input, select, textarea, [role='button']").length;
          return {
            node,
            metric,
            blockCount: directBlocks.length,
            textLength,
            interactiveCount,
          };
        })
        .filter(Boolean)
        .filter((item) => item.blockCount <= 4 && item.textLength <= 120 && item.interactiveCount <= 3);
    }

    const mainStage = firstMetric(selectors.mainStage);
    const hero = firstMetric(selectors.hero);
    const sideRailNode = selectors.sideRail
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const sideRail = firstMetric(selectors.sideRail);
    const largeSurfaces = collectLargeSurfaces();
    const visibleLargeSurfaceCount = largeSurfaces.filter((item) => item.metric.visibleArea > 0).length;
    const sparseRightColumns = collectSparseRightColumns();

    const secondaryCandidates = Array.from(document.querySelectorAll(selectors.secondarySections.join(",")));
    const belowFoldSecondaryCount = secondaryCandidates
      .map((node) => getVisibleMetrics(node))
      .filter((metric) => metric && metric.top >= viewportHeight * 0.9 && metric.height >= viewportHeight * 0.18)
      .length;

    const visibleSummaryCardCount = Array.from(document.querySelectorAll(selectors.summaryCards.join(",")))
      .map((node) => getVisibleMetrics(node))
      .filter((metric) => metric && metric.visibleArea > 0)
      .length;

    const anchorJumpTargets = Array.from(document.querySelectorAll(selectors.jumpControls.join(",")))
      .map((node) => {
        const metric = getVisibleMetrics(node);
        if (!metric || metric.visibleArea <= 0) {
          return null;
        }
        const href = node.getAttribute("href") || "";
        const rawTarget =
          (href.startsWith("#") ? href.slice(1) : "") ||
          node.getAttribute("data-scroll-target") ||
          node.getAttribute("data-jump-target") ||
          node.getAttribute("data-scroll-to") ||
          "";
        const targetId = rawTarget.replace(/^#/, "");
        if (!targetId || ["app", "content", "main", "root", "top"].includes(targetId.toLowerCase())) {
          return null;
        }
        const targetNode = document.getElementById(targetId);
        if (!targetNode) {
          return null;
        }
        const targetMetric = getVisibleMetrics(targetNode);
        if (!targetMetric) {
          return null;
        }
        const hidden =
          targetNode.hidden ||
          targetNode.getAttribute("aria-hidden") === "true" ||
          targetNode.getAttribute("data-state") === "closed" ||
          targetNode.getAttribute("data-collapsed") === "true";
        if (hidden) {
          return null;
        }
        return { targetMetric };
      })
      .filter(Boolean);
    const belowFoldAnchorJumpCount = anchorJumpTargets.filter(
      (item) => item.targetMetric.top >= viewportHeight * 0.9 && item.targetMetric.height >= viewportHeight * 0.18,
    ).length;

    const disclosureControlCount = document.querySelectorAll(selectors.disclosureControls.join(",")).length;
    const hasTablist = document.querySelectorAll("[role='tablist']").length > 0;
    const hasTabpanel = document.querySelectorAll("[role='tabpanel']").length > 0;
    const controlTargets = Array.from(document.querySelectorAll("[aria-controls]"))
      .map((node) => node.getAttribute("aria-controls"))
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const controlledPanels = Array.from(document.querySelectorAll(selectors.controlledPanels.join(",")));
    const hiddenControlledPanels = controlledPanels.filter((node) => {
      if (node.hidden) {
        return true;
      }
      const ariaHidden = node.getAttribute("aria-hidden");
      const dataState = node.getAttribute("data-state");
      const dataCollapsed = node.getAttribute("data-collapsed");
      return ariaHidden === "true" || dataState === "closed" || dataCollapsed === "true";
    });
    const hiddenControlTargets = controlTargets.filter((node) => {
      if (node.hidden) {
        return true;
      }
      const ariaHidden = node.getAttribute("aria-hidden");
      const dataState = node.getAttribute("data-state");
      const dataCollapsed = node.getAttribute("data-collapsed");
      return ariaHidden === "true" || dataState === "closed" || dataCollapsed === "true";
    });
    const effectiveDisclosure =
      hasTabpanel ||
      hiddenControlTargets.length > 0 ||
      (hiddenControlledPanels.length > 0 && (hasTablist || controlTargets.length > 0));

    const mainStageViewportRatio = mainStage?.viewportRatio || 0;
    const heroViewportRatio = hero?.viewportRatio || 0;
    const sideRailViewportRatio = sideRail?.viewportRatio || 0;
    const sideRailContent = estimateSideRailContentDensity(sideRailNode, sideRail);
    const sideRailContentDensity = sideRailContent.density;
    const sideRailInteractiveCount = sideRailContent.interactiveCount;
    const sparseRightColumnCount = sparseRightColumns.length;

    const signals = [];

    if (hero && sideRail && mainStage && mainStageViewportRatio < heroViewportRatio + sideRailViewportRatio) {
      signals.push({
        id: "three_way_split",
        severity: "fail",
        message: "首屏被 intro/hero、main stage 與 side rail 三分，主舞台沒有明顯支配畫面。",
      });
    }

    if (mainStage && mainStageViewportRatio < 0.33) {
      signals.push({
        id: "main_stage_not_dominant",
        severity: "fail",
        message: "主舞台在第一個 viewport 內的可視面積過小，沒有佔據主要部分。",
      });
    }

    if (belowFoldSecondaryCount >= 2) {
      signals.push({
        id: "stacked_sections_below_fold",
        severity: "fail",
        message: "有兩個以上大型次級區塊直接掉到首屏外，代表重要內容仍以 stacked sections 往下堆。",
      });
    }

    if (belowFoldAnchorJumpCount >= 1 && belowFoldSecondaryCount >= 1) {
      signals.push({
        id: "anchor_jumps_to_stacked_sections",
        severity: "fail",
        message: "首屏可見控制會把使用者跳到首屏外的大型次級區塊，表示畫面仍在向下堆疊內容，再靠錨點補救。",
      });
    }

    if (visibleLargeSurfaceCount >= 3) {
      signals.push({
        id: "too_many_large_surfaces",
        severity: "fail",
        message: "第一個 viewport 同時暴露三個以上大型表面，閱讀與任務焦點被分散。",
      });
    }

    if (visibleSummaryCardCount >= 3 && mainStageViewportRatio < 0.4) {
      signals.push({
        id: "summary_cluster_competes",
        severity: "fail",
        message: "摘要卡片群與主舞台同時競爭首屏，畫面更像 summary-first dashboard。",
      });
    }

    if (hasTablist && !effectiveDisclosure && visibleLargeSurfaceCount >= 3) {
      signals.push({
        id: "controls_do_not_reduce_disclosure",
        severity: "fail",
        message: "有 tablist/切換控制，但 DOM 內沒有對應的 hidden/tabpanel/collapsed 區塊，代表控制項沒有真的減少展露量。",
      });
    }

    if (hero && heroViewportRatio >= 0.18 && mainStageViewportRatio < 0.36) {
      signals.push({
        id: "hero_dominates_task",
        severity: "fail",
        message: "hero / intro 區在首屏佔比過高，壓過真正的功能主舞台。",
      });
    }

    if (
      activeViewport === "desktop" &&
      sideRail &&
      sideRailViewportRatio >= 0.14 &&
      sideRailContentDensity <= 0.55 &&
      sideRailInteractiveCount <= 3 &&
      mainStageViewportRatio < 0.48
    ) {
      signals.push({
        id: "side_rail_waste",
        severity: "fail",
        message: "右側 rail 佔據大量首屏面積，但內容密度與互動量偏低，代表右側出現無效留白或版面浪費。",
      });
    }

    if (activeViewport === "desktop" && sparseRightColumnCount >= 1 && mainStageViewportRatio < 0.48) {
      signals.push({
        id: "sparse_right_column_waste",
        severity: "fail",
        message: "首屏右半部存在大面積但內容稀薄的欄位容器，代表畫面把重要寬度浪費在稀疏右欄。",
      });
    }

    if (activeViewport === "mobile" && (!mainStage || mainStage.top > viewportHeight * 0.33 || mainStageViewportRatio < 0.22)) {
      signals.push({
        id: "responsive_primary_task_offscreen",
        severity: "fail",
        message: "mobile viewport 下主功能沒有在前段可視區啟動，響應式設計不足。",
      });
    }

    return {
      metrics: {
        mainStageViewportRatio,
        heroViewportRatio,
        sideRailViewportRatio,
        sideRailContentDensity,
        sideRailInteractiveCount,
        sparseRightColumnCount,
        visibleLargeSurfaceCount,
        belowFoldSecondaryCount,
        belowFoldAnchorJumpCount,
        visibleSummaryCardCount,
        disclosureControlCount,
        hiddenControlledPanelCount: hiddenControlledPanels.length + hiddenControlTargets.length,
        effectiveDisclosure,
      },
      signals,
    };
  }, viewportName);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const resolved = await resolveTarget(args.target);
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = args.screenshotDir ? path.resolve(args.screenshotDir) : "";
  ensureDir(screenshotDir);

  try {
    const viewports = [];
    for (const [name, viewport] of getViewportList(args.viewport)) {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(resolved.url, { waitUntil: "networkidle", timeout: 20000 });
      } catch {
        await page.goto(resolved.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      }
      await page.waitForTimeout(400);

      const evaluated = await analyzePage(page, name);
      const screenshotPath = screenshotDir
        ? path.join(screenshotDir, `${name}.png`)
        : "";
      if (screenshotPath) {
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }

      viewports.push(
        summarizeViewport({
          name,
          width: viewport.width,
          height: viewport.height,
          metrics: evaluated.metrics,
          signals: evaluated.signals,
          screenshotPath,
        }),
      );
      await page.close();
    }

    const summary = { pass: 0, warn: 0, fail: 0 };
    for (const viewport of viewports) {
      summary[viewport.status] += 1;
    }

    const report = {
      target: args.target,
      resolvedUrl: resolved.url,
      screenshotDir,
      viewports,
      summary,
    };

    if (args.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }

    if (summary.fail > 0) {
      process.exitCode = 1;
    } else if (summary.warn > 0) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
    if (resolved.cleanup) {
      await resolved.cleanup();
    }
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
