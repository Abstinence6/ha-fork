import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  describeGitHubDiffTarget,
  extractGitHubPreviewTarget,
  extractGitHubDiffTarget,
  fetchGitHubDiffText,
  fetchGitHubPreviewText,
  describeGitHubPreviewTarget,
  renderDiffHtml,
  renderGitHubPreviewHtml,
  isLikelyUnifiedDiff,
} from "../custom_components/openclaw/www/openclaw-chat-card-utils.js";

const diffText = `diff --git a/file.txt b/file.txt
index 1234567..89abcde 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
-old line
+new line
 context line
diff --git a/second.txt b/second.txt
index 1111111..2222222 100644
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-old second
+new second`;

assert.equal(isLikelyUnifiedDiff(diffText), true);

const html = renderDiffHtml(diffText);
assert.match(html, /diff-line diff-meta/);
assert.match(html, /diff-line diff-remove/);
assert.match(html, /diff-line diff-add/);
assert.match(html, /new line/);
assert.match(html, /old line/);
assert.match(html, /<details class="diff-file-group">/);
assert.equal((html.match(/<details class="diff-file-group">/g) || []).length, 2);
assert.match(html, /<span class="diff-file-title">file.txt/);
assert.match(html, /<span class="diff-file-title">second.txt/);
assert.equal(isLikelyUnifiedDiff("just regular markdown"), false);

const gitShowText = `commit abcdef1234567890
Author: OpenClaw Bot <bot@example.com>
Date:   Mon Jan 1 00:00:00 2026 +0000

    Update docs

diff --git a/docs.txt b/docs.txt
index 1111111..2222222 100644
--- a/docs.txt
+++ b/docs.txt
@@ -1 +1 @@
-old docs
+new docs`;

assert.equal(isLikelyUnifiedDiff(gitShowText), true);

const commitTarget = extractGitHubDiffTarget(
  "https://github.com/Abstinence6/ha-fork/commit/90fcfab"
);
assert.deepEqual(commitTarget, {
  owner: "Abstinence6",
  repo: "ha-fork",
  kind: "commit",
  ref: "90fcfab",
  url: "https://github.com/Abstinence6/ha-fork/commit/90fcfab",
});

const pullTarget = extractGitHubDiffTarget(
  "See https://github.com/Abstinence6/ha-fork/pull/123 for details"
);
assert.equal(pullTarget?.kind, "pull");
assert.equal(pullTarget?.ref, "123");

const markdownTarget = extractGitHubDiffTarget(
  "Preview this: [commit diff](https://github.com/Abstinence6/ha-fork/commit/90fcfab)"
);
assert.equal(markdownTarget?.kind, "commit");
assert.equal(markdownTarget?.ref, "90fcfab");
assert.equal(describeGitHubDiffTarget(markdownTarget), "Commit 90fcfab");
assert.equal(describeGitHubDiffTarget(pullTarget), "PR #123");

const shortTarget = extractGitHubDiffTarget(
  "github.com/Abstinence6/ha-fork/commit/90fcfab"
);
assert.equal(shortTarget?.kind, "commit");
assert.equal(shortTarget?.url, "https://github.com/Abstinence6/ha-fork/commit/90fcfab");

const compareTarget = extractGitHubDiffTarget(
  "https://github.com/Abstinence6/ha-fork/compare/90fcfab...b533c70"
);
assert.equal(compareTarget?.kind, "compare");
assert.equal(compareTarget?.ref, "90fcfab...b533c70");
assert.equal(describeGitHubDiffTarget(compareTarget), "Compare 90fcfab...b533c70");

let capturedRequest = null;
const mockFetch = async (url, init) => {
  capturedRequest = { url, init };
  if (String(url).includes("/contents/")) {
    return {
      ok: true,
      json: async () => ({
        content: Buffer.from("line one\nline two\nline three\nline four\nline five").toString("base64"),
        encoding: "base64",
      }),
    };
  }
  return {
    ok: true,
    text: async () => diffText,
  };
};

const fetched = await fetchGitHubDiffText(commitTarget, mockFetch);
assert.equal(fetched, diffText);
assert.match(capturedRequest.url, /api\.github\.com\/repos\/Abstinence6\/ha-fork\/commits\/90fcfab/);
assert.match(String(capturedRequest.init.headers.Accept), /vnd\.github\./);

capturedRequest = null;
const fetchedCompare = await fetchGitHubDiffText(compareTarget, mockFetch);
assert.equal(fetchedCompare, diffText);
assert.match(capturedRequest.url, /api\.github\.com\/repos\/Abstinence6\/ha-fork\/compare\/90fcfab\.{3}b533c70/);

const blobTarget = extractGitHubPreviewTarget(
  "https://github.com/Abstinence6/ha-fork/blob/main/custom_components/openclaw/const.py#L1-L4"
);
assert.equal(blobTarget?.kind, "blob");
assert.equal(blobTarget?.path, "custom_components/openclaw/const.py");
assert.equal(blobTarget?.ref, "main");
assert.equal(blobTarget?.fragment, "L1-L4");
assert.equal(describeGitHubPreviewTarget(blobTarget), "File const.py");

capturedRequest = null;
const fetchedBlob = await fetchGitHubPreviewText(blobTarget, mockFetch);
assert.match(capturedRequest.url, /api\.github\.com\/repos\/Abstinence6\/ha-fork\/contents\/custom_components\/openclaw\/const\.py\?ref=main/);
assert.match(String(capturedRequest.init.headers.Accept), /vnd\.github.*json/);
assert.match(fetchedBlob, /line one/);

const blobHtml = renderGitHubPreviewHtml(blobTarget, fetchedBlob);
assert.match(blobHtml, /code-excerpt/);
assert.match(blobHtml, /code-line-highlight/);
assert.match(blobHtml, /line one/);

const previewDiffHtml = renderGitHubPreviewHtml(commitTarget, diffText);
assert.match(previewDiffHtml, /<details class="diff-file-group">/);
