function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isDiffMetaLine(line) {
  return (
    line.startsWith("commit ") ||
    line.startsWith("tree ") ||
    line.startsWith("parent ") ||
    line.startsWith("Author: ") ||
    line.startsWith("Date: ") ||
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("+++ ") ||
    line.startsWith("--- ") ||
    line.startsWith("@@")
  );
}

function renderDiffLine(line) {
  const trimmed = line.replace(/\s+$/, "");
  let className = "diff-context";

  if (trimmed.startsWith("@@")) {
    className = "diff-hunk";
  } else if (trimmed.startsWith("+++ ") || trimmed.startsWith("--- ")) {
    className = "diff-file";
  } else if (isDiffMetaLine(trimmed)) {
    className = "diff-meta";
  } else if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) {
    className = "diff-add";
  } else if (trimmed.startsWith("-") && !trimmed.startsWith("---")) {
    className = "diff-remove";
  }

  return `<div class="diff-line ${className}">${escapeHtml(trimmed)}</div>`;
}

function renderDiffLines(lines) {
  return lines.map((line) => renderDiffLine(line)).join("");
}

function normalizeGitHubUrl(url) {
  try {
    const normalized = String(url || "").startsWith("http") ? String(url) : `https://${String(url)}`;
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}

function parseGitHubTargetUrl(url) {
  const normalizedUrl = normalizeGitHubUrl(url);
  if (!normalizedUrl) return null;

  let parsed;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return null;
  }

  if (!/^(?:www\.)?github\.com$/i.test(parsed.hostname)) {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 4) {
    return null;
  }

  const [owner, repo, kind, ...rest] = parts;
  if (!owner || !repo || !kind || rest.length === 0) {
    return null;
  }

  const normalizedKind = kind.toLowerCase();
  if (!["commit", "pull", "compare", "blob"].includes(normalizedKind)) {
    return null;
  }

  const ref = normalizedKind === "blob" ? rest[0] : rest.join("/");
  const path = normalizedKind === "blob" ? rest.slice(1).join("/") : undefined;
  if (!ref || (normalizedKind === "blob" && !path)) return null;

  return {
    owner,
    repo,
    kind: normalizedKind,
    ref,
    url: parsed.toString(),
    ...(normalizedKind === "blob"
      ? {
          path,
          fragment: parsed.hash ? parsed.hash.slice(1) : "",
        }
      : {}),
  };
}

export function isLikelyUnifiedDiff(text) {
  if (!text || typeof text !== "string") return false;

  const lines = text.split(/\r?\n/);
  let hasDiffMarker = false;
  let hasHunk = false;
  let hasChangeLine = false;
  let hasGitCommitHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("@@") ||
      line.startsWith("commit ") ||
      line.startsWith("Author: ") ||
      line.startsWith("Date: ")
    ) {
      hasDiffMarker = true;
    }
    if (line.startsWith("@@")) {
      hasHunk = true;
    }
    if (line.startsWith("commit ") || line.startsWith("Author: ") || line.startsWith("Date: ")) {
      hasGitCommitHeader = true;
    }
    if ((line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) {
      hasChangeLine = true;
    }
  }

  return (hasDiffMarker && hasChangeLine) || (hasHunk && hasChangeLine) || (hasGitCommitHeader && hasChangeLine);
}

function splitUnifiedDiffSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  const preamble = [];
  let current = null;

  const flushCurrent = () => {
    if (current) {
      sections.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flushCurrent();
      current = { lines: [line] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  flushCurrent();

  if (!sections.length) {
    return {
      preamble: [],
      sections: [{ title: "Diff", lines }],
    };
  }

  return { preamble, sections };
}

function getDiffSectionTitle(section, index) {
  const firstDiffLine = section.lines.find((line) => line.startsWith("diff --git "));
  if (firstDiffLine) {
    const match = firstDiffLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      const fromPath = match[1];
      const toPath = match[2];
      if (fromPath === toPath) {
        return toPath;
      }
      return `${fromPath} → ${toPath}`;
    }
  }

  const fileLine = section.lines.find((line) => line.startsWith("+++ ") || line.startsWith("--- "));
  if (fileLine) {
    const match = fileLine.match(/^[+-]{3}\s+[ab]\/(.+)$/);
    if (match) {
      return match[1];
    }
  }

  return `Diff ${index + 1}`;
}

export function renderDiffHtml(text) {
  if (!text) return "";

  const { preamble, sections } = splitUnifiedDiffSections(text);
  const renderedPreamble = preamble.length
    ? `<div class="diff-preamble">${renderDiffLines(preamble)}</div>`
    : "";
  const renderedSections = sections
    .map(
      (section, index) => `
        <details class="diff-file-group">
          <summary class="diff-file-head">
            <span class="diff-file-title">${escapeHtml(getDiffSectionTitle(section, index))}</span>
            <span class="diff-file-hint">Click to expand</span>
          </summary>
          <div class="diff-file-body">
            <div class="diff-lines">${renderDiffLines(section.lines)}</div>
          </div>
        </details>`
    )
    .join("");

  return `<div class="diff-block">${renderedPreamble}${renderedSections}</div>`;
}

export function extractGitHubDiffTarget(text) {
  const target = extractGitHubPreviewTarget(text);
  if (!target || target.kind === "blob") return null;
  return target;
}

export function extractGitHubPreviewTarget(text) {
  if (!text || typeof text !== "string") return null;

  const markdownLinkPattern =
    /\[[^\]]+\]\((?:https?:\/\/)?(?:www\.)?github\.com\/[^)\s]+\)/i;
  const plainUrlPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)]+/i;
  const markdownMatch = text.match(markdownLinkPattern);
  const urlMatch = markdownMatch || text.match(plainUrlPattern);
  if (!urlMatch) return null;

  const rawUrl = markdownMatch ? urlMatch[0].slice(urlMatch[0].indexOf("(") + 1, -1) : urlMatch[0];
  return parseGitHubTargetUrl(rawUrl);
}

export function describeGitHubDiffTarget(target) {
  if (!target || !target.kind || !target.ref) return "GitHub diff preview";
  if (target.kind === "pull") {
    return `PR #${target.ref}`;
  }
  if (target.kind === "compare") {
    return `Compare ${target.ref}`;
  }
  return `Commit ${String(target.ref).slice(0, 7)}`;
}

function getGitHubFileName(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "file";
}

function parseLineFragment(fragment) {
  const normalized = String(fragment || "").replace(/^#/, "");
  const match = normalized.match(/L(\d+)(?:-L?(\d+))?/i);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return {
    start: Math.max(1, Math.min(start, end)),
    end: Math.max(1, Math.max(start, end)),
  };
}

function decodeBase64Content(content) {
  const normalized = String(content || "").replace(/\s+/g, "");
  if (!normalized) return "";
  if (typeof atob === "function") {
    return atob(normalized);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized, "base64").toString("utf8");
  }
  throw new Error("base64_decoder_unavailable");
}

export function buildGitHubPreviewApiUrl(target) {
  if (!target || !target.owner || !target.repo || !target.ref || !target.kind) return null;

  if (target.kind === "commit") {
    return `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/commits/${encodeURIComponent(target.ref)}`;
  }

  if (target.kind === "pull") {
    return `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/pulls/${encodeURIComponent(target.ref)}`;
  }

  if (target.kind === "compare") {
    return `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/compare/${encodeURIComponent(target.ref)}`;
  }

  if (target.kind === "blob") {
    const encodedPath = String(target.path || "")
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(target.ref)}`;
  }

  return null;
}

export async function fetchGitHubPreviewText(target, fetchImpl = fetch) {
  const apiUrl = buildGitHubPreviewApiUrl(target);
  if (!apiUrl) {
    throw new Error("unsupported_github_target");
  }

  if (target.kind === "blob") {
    const response = await fetchImpl(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`github_preview_request_failed_${response.status}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload.content !== "string") {
      throw new Error("github_preview_response_not_file");
    }

    const decoded = decodeBase64Content(payload.content);
    if (!decoded) {
      throw new Error("github_preview_response_empty");
    }

    return decoded;
  }

  const response = await fetchImpl(apiUrl, {
    headers: {
      Accept: "application/vnd.github.v3.diff, application/vnd.github.diff, text/plain",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`github_diff_request_failed_${response.status}`);
  }

  const text = await response.text();
  if (!text || !isLikelyUnifiedDiff(text)) {
    throw new Error("github_diff_response_not_diff");
  }

  return text;
}

export function describeGitHubPreviewTarget(target) {
  if (!target || !target.kind) return "GitHub preview";
  if (target.kind === "blob") {
    const fileName = getGitHubFileName(target.path || "");
    return `File ${fileName}`;
  }
  return describeGitHubDiffTarget(target);
}

function renderCodeExcerptLine(lineNumber, lineText, isHighlighted) {
  const number = String(lineNumber).padStart(4, " ");
  const classes = ["code-line"];
  if (isHighlighted) classes.push("code-line-highlight");
  return `<div class="${classes.join(" ")}"><span class="code-line-no">${escapeHtml(number)}</span><span class="code-line-text">${escapeHtml(lineText)}</span></div>`;
}

export function renderGitHubPreviewHtml(target, text) {
  if (!target || !target.kind) return "";
  if (target.kind === "blob") {
    const lines = String(text || "").split(/\r?\n/);
    const range = parseLineFragment(target.fragment) || { start: 1, end: Math.min(lines.length, 40) };
    const context = 2;
    const start = Math.max(1, range.start - context);
    const end = Math.min(lines.length, range.end + context);
    const rendered = [];
    for (let lineNo = start; lineNo <= end; lineNo += 1) {
      const lineText = lines[lineNo - 1] ?? "";
      rendered.push(renderCodeExcerptLine(lineNo, lineText, lineNo >= range.start && lineNo <= range.end));
    }
    return `<div class="code-excerpt">${rendered.join("")}</div>`;
  }

  return renderDiffHtml(text);
}

export { buildGitHubPreviewApiUrl as buildGitHubDiffApiUrl };
export { fetchGitHubPreviewText as fetchGitHubDiffText };
