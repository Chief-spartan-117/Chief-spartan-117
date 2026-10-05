// Generates self-hosted GitHub profile cards (SVG) into ./profile:
//   stats.svg     - overview numbers + rank
//   top-langs.svg - language breakdown donut
//   streak.svg    - total contributions and streaks
//   activity.svg  - last-year contribution heatmap
//   tech-stack.svg - technologies detected in owned and contributed-to repos
// No dependencies: runs on Node 20+ with the built-in fetch.
import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.env.STATS_USERNAME || "Chief-spartan-117";
const TOKEN = process.env.GH_TOKEN;
const OUT_DIR = process.env.STATS_OUT_DIR || "profile";
// Comma-separated languages to leave out of the languages card, e.g. "Jupyter Notebook,HTML".
const EXCLUDE_LANGS = (process.env.STATS_EXCLUDE_LANGS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const LANGS_COUNT = 6;

if (!TOKEN) throw new Error("GH_TOKEN is not set");

// Dracula theme
const theme = {
  bg1: "#2b2d3a",
  bg2: "#1e1f29",
  border: "#44475a",
  title1: "#ff79c6",
  title2: "#bd93f9",
  text: "#f8f8f2",
  muted: "#a3a9c7",
  icon: "#8be9fd",
  ring: "#ff79c6",
  track: "#3a3c4e",
  flame: "#ffb86c",
  heat: ["#30323f", "#4b3f72", "#6c50ad", "#9a73e6", "#d0a8ff"],
};

// Octicons (16px), https://primer.style/octicons
const icons = {
  star: '<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"/>',
  commit: '<path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>',
  pr: '<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>',
  review: '<path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 13H8.061l-2.574 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25v-8.5C0 1.784.784 1 1.75 1ZM1.5 2.75v8.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm5.28 1.72a.75.75 0 0 1 0 1.06L5.31 7l1.47 1.47a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 0Zm2.44 0a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1 0 1.06l-2 2a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.69 7 9.22 5.53a.75.75 0 0 1 0-1.06Z"/>',
  issue: '<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>',
  repo: '<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>',
  push: '<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V1.5h-8a1 1 0 0 0-1 1v6.708A2.493 2.493 0 0 1 4.5 9h2.25a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0 0 2h4.75a.75.75 0 0 1 0 1.5H4.5A2.5 2.5 0 0 1 2 11.5Zm12.23 7.79h-.001l-1.224-1.224v6.184a.75.75 0 0 1-1.5 0V9.066L10.28 10.29a.75.75 0 0 1-1.06-1.061l2.505-2.504a.75.75 0 0 1 1.06 0L15.29 9.23a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018Z"/>',
  people: '<path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z"/>',
  flame: '<path d="M9.533.753V.752c.217 2.385 1.463 3.626 2.653 4.81C13.37 6.74 14.498 7.863 14.498 10c0 3.5-3 6-6.5 6S1.5 13.512 1.5 10c0-1.298.536-2.56 1.425-3.286.376-.308.862 0 1.035.454C4.46 8.487 5.581 8.419 6 8c.282-.282.341-.811-.003-1.5C4.34 3.187 7.035.75 8.77.146c.39-.137.726.194.763.607ZM7.998 14.5c2.832 0 5-1.98 5-4.5 0-1.463-.68-2.19-1.879-3.383l-.036-.037c-1.013-1.008-2.3-2.29-2.834-4.434-.322.256-.63.579-.864.953-.432.696-.621 1.58-.046 2.73.473.947.67 2.284-.278 3.232-.61.61-1.545.84-2.403.633a2.79 2.79 0 0 1-1.436-.874A3.198 3.198 0 0 0 3 10c0 2.53 2.164 4.5 4.998 4.5Z"/>',
};

// With partial: true, data is returned even if some fields failed (e.g. a repo that is gone).
async function gql(query, variables = {}, { partial = false } = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || (json.errors && !(partial && json.data))) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

const CALENDAR = `contributionCalendar {
  totalContributions
  weeks { contributionDays { date contributionCount } }
}`;

async function fetchStats() {
  const base = await gql(
    `query($login: String!) {
      user(login: $login) {
        name
        createdAt
        followers { totalCount }
        pullRequests { totalCount }
        issues { totalCount }
        repositories(ownerAffiliations: OWNER) { totalCount }
        repositoriesContributedTo(contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
        contributionsCollection {
          contributionYears
          ${CALENDAR}
        }
      }
    }`,
    { login: USERNAME },
  );
  const user = base.user;
  const now = new Date();

  // Walk every contribution year for all-time commits, reviews and daily counts.
  let commits = 0;
  let reviews = 0;
  let totalContributions = 0;
  const days = new Map();
  const contributedRepos = new Set();
  for (const year of user.contributionsCollection.contributionYears) {
    const end = new Date(`${year}-12-31T23:59:59Z`);
    const data = await gql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
            totalPullRequestReviewContributions
            commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
            pullRequestContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
            ${CALENDAR}
          }
        }
      }`,
      { login: USERNAME, from: `${year}-01-01T00:00:00Z`, to: (end < now ? end : now).toISOString() },
    );
    const c = data.user.contributionsCollection;
    commits += c.totalCommitContributions + c.restrictedContributionsCount;
    reviews += c.totalPullRequestReviewContributions;
    totalContributions += c.contributionCalendar.totalContributions;
    for (const week of c.contributionCalendar.weeks) {
      for (const d of week.contributionDays) days.set(d.date, d.contributionCount);
    }
    for (const { repository } of [...c.commitContributionsByRepository, ...c.pullRequestContributionsByRepository]) {
      contributedRepos.add(repository.nameWithOwner);
    }
  }

  // Walk all owned, non-fork repositories for stars and languages.
  let stars = 0;
  const langs = new Map();
  const ownedRepos = [];
  let cursor = null;
  do {
    const data = await gql(
      `query($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              nameWithOwner
              stargazerCount
              languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
                edges { size node { name color } }
              }
            }
          }
        }
      }`,
      { login: USERNAME, cursor },
    );
    const repos = data.user.repositories;
    for (const repo of repos.nodes) {
      stars += repo.stargazerCount;
      ownedRepos.push(repo.nameWithOwner);
      for (const { size, node } of repo.languages.edges) {
        if (EXCLUDE_LANGS.includes(node.name.toLowerCase())) continue;
        const prev = langs.get(node.name) || { size: 0, color: node.color || "#858585" };
        prev.size += size;
        langs.set(node.name, prev);
      }
    }
    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (cursor);

  const today = now.toISOString().slice(0, 10);
  const allDays = [...days.entries()]
    .filter(([date]) => date <= today)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }));

  return {
    name: user.name || USERNAME,
    createdAt: user.createdAt,
    stars,
    commits,
    reviews,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    repos: user.repositories.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
    followers: user.followers.totalCount,
    totalContributions,
    allDays,
    ownedRepos,
    contributedRepos: [...contributedRepos],
    lastYear: user.contributionsCollection.contributionCalendar,
    langs: [...langs.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.size - a.size),
  };
}

// Same rank model as github-readme-stats: weighted CDFs against median values.
function calculateRank({ commits, prs, issues, reviews, stars, followers }) {
  const exp = (x) => 1 - 2 ** -x;
  const logNormal = (x) => x / (1 + x);
  const parts = [
    [2, exp(commits / 1000)],
    [3, exp(prs / 50)],
    [1, exp(issues / 25)],
    [1, exp(reviews / 2)],
    [4, logNormal(stars / 50)],
    [1, logNormal(followers / 10)],
  ];
  const total = parts.reduce((s, [w]) => s + w, 0);
  const rank = 1 - parts.reduce((s, [w, v]) => s + w * v, 0) / total;
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ["S", "A+", "A", "A-", "B+", "B", "B-", "C+", "C"];
  const percentile = rank * 100;
  return { level: levels[thresholds.findIndex((t) => percentile <= t)], percentile };
}

function computeStreaks(allDays) {
  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null, end: null };
  for (const d of allDays) {
    if (d.count > 0) {
      run = run.length ? { ...run, length: run.length + 1, end: d.date } : { length: 1, start: d.date, end: d.date };
      if (run.length > longest.length) longest = { ...run };
    } else {
      run = { length: 0, start: null, end: null };
    }
  }
  // Current streak: a quiet "today" doesn't break it yet.
  let current = { length: 0, start: null, end: null };
  let i = allDays.length - 1;
  if (i >= 0 && allDays[i].count === 0) i--;
  for (; i >= 0 && allDays[i].count > 0; i--) {
    current = { length: current.length + 1, start: allDays[i].date, end: current.end || allDays[i].date };
  }
  return { current, longest };
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));

const fmtDate = (iso, withYear = true) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

const fmtRange = (s) => {
  if (!s.start) return "No streak yet";
  if (s.start === s.end) return fmtDate(s.start);
  const sameYear = s.start.slice(0, 4) === s.end.slice(0, 4);
  return `${fmtDate(s.start, !sameYear)} – ${fmtDate(s.end)}`;
};

const icon = (name, x, y, color = theme.icon, size = 16) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="${color}">${icons[name]}</svg>`;

function card({ width, height, title, subtitle = "", body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.title1}"/>
      <stop offset="100%" stop-color="${theme.title2}"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif; }
    .title { font-size: 18px; font-weight: 700; fill: url(#accent); }
    .subtitle { font-size: 12px; fill: ${theme.muted}; }
    .label { font-size: 14px; font-weight: 600; fill: ${theme.text}; }
    .value { font-size: 14px; font-weight: 700; fill: ${theme.text}; }
    .small { font-size: 12px; fill: ${theme.text}; }
    .muted { font-size: 12px; fill: ${theme.muted}; }
    .big { font-size: 28px; font-weight: 700; fill: ${theme.text}; }
    .fade { animation: fadeIn 0.6s ease-in-out both; }
    @keyframes fadeIn { from { opacity: 0; } }
    @keyframes grow { from { stroke-dashoffset: var(--full); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>
  <rect x="0.5" y="0.5" rx="10" width="${width - 1}" height="${height - 1}" fill="url(#bg)" stroke="${theme.border}"/>
  <rect x="25" y="47" width="40" height="3" rx="1.5" fill="url(#accent)"/>
  <text x="25" y="35" class="title">${esc(title)}</text>
  ${subtitle ? `<text x="${width - 25}" y="35" class="subtitle" text-anchor="end">${esc(subtitle)}</text>` : ""}
${body}
</svg>
`;
}

function statsCard(s) {
  const rows = [
    ["star", "Total Stars Earned", s.stars],
    ["commit", "Total Commits", s.commits],
    ["pr", "Total Pull Requests", s.prs],
    ["review", "Pull Requests Reviewed", s.reviews],
    ["issue", "Total Issues", s.issues],
    ["repo", "Public Repositories", s.repos],
    ["push", "Contributed to (last year)", s.contributedTo],
    ["people", "Followers", s.followers],
  ];
  const body = rows
    .map(
      ([ic, label, value], i) => `  <g class="fade" style="animation-delay: ${150 + i * 100}ms" transform="translate(25, ${72 + i * 22})">
    ${icon(ic, 0, -12)}
    <text x="26" y="0" class="label">${label}:</text>
    <text x="290" y="0" class="value" text-anchor="end">${fmt(value)}</text>
  </g>`,
    )
    .join("\n");

  const { level, percentile } = calculateRank(s);
  const r = 46;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0.03, 1 - percentile / 100);
  const ring = `  <g transform="translate(400, 130)">
    <circle r="${r}" fill="none" stroke="${theme.track}" stroke-width="7"/>
    <circle r="${r}" fill="none" stroke="url(#accent)" stroke-width="7" stroke-linecap="round"
      transform="rotate(-90)" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - progress)).toFixed(2)}"
      style="--full: ${c.toFixed(2)}; animation: grow 1.2s ease-out forwards"/>
    <text y="10" class="big" text-anchor="middle">${level}</text>
    <text y="${r + 30}" class="muted" text-anchor="middle">Top ${percentile < 1 ? percentile.toFixed(1) : Math.round(percentile)}% · Rank</text>
  </g>`;

  return card({ width: 495, height: 255, title: `${s.name}'s GitHub Stats`, body: `${body}\n${ring}` });
}

function langsCard(langs) {
  const total = langs.reduce((sum, l) => sum + l.size, 0) || 1;
  let items = langs.slice(0, LANGS_COUNT);
  const rest = langs.slice(LANGS_COUNT).reduce((sum, l) => sum + l.size, 0);
  if (rest > 0) items = [...items, { name: "Other", size: rest, color: "#6272a4" }];

  const r = 42;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segments = items
    .map((l) => {
      const len = (l.size / total) * c;
      const seg = `<circle r="${r}" fill="none" stroke="${l.color}" stroke-width="14"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
      acc += len;
      return seg;
    })
    .join("\n    ");
  const donut = `  <g class="fade" transform="translate(70, 145)">
    <g transform="rotate(-90)">
    ${segments || `<circle r="${r}" fill="none" stroke="${theme.track}" stroke-width="14"/>`}
    </g>
    <text y="4" class="value" text-anchor="middle" style="font-size: 20px">${langs.length}</text>
    <text y="20" class="muted" text-anchor="middle" style="font-size: 10px">languages</text>
  </g>`;

  const legend = items
    .map((l, i) => {
      const pct = (l.size / total) * 100;
      return `  <g class="fade" style="animation-delay: ${200 + i * 100}ms" transform="translate(132, ${82 + i * 23})">
    <circle cx="5" cy="-4" r="5" fill="${l.color}"/>
    <text x="16" y="0" class="small">${esc(l.name)}</text>
    <text x="150" y="0" class="muted" text-anchor="end">${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%</text>
  </g>`;
    })
    .join("\n");

  return card({
    width: 305,
    height: 255,
    title: "Most Used Languages",
    body: `${donut}\n${legend || '  <text x="132" y="90" class="small">No language data yet</text>'}`,
  });
}

function streakCard(s) {
  const { current, longest } = computeStreaks(s.allDays);
  const firstDay = s.allDays.find((d) => d.count > 0)?.date || s.createdAt;
  const col = (x, delay, inner) => `  <g class="fade" style="animation-delay: ${delay}ms" transform="translate(${x}, 0)">${inner}</g>`;
  const r = 40;
  const c = 2 * Math.PI * r;
  const ringFill = Math.min(1, current.length / Math.max(longest.length, 1));

  const body = [
    col(
      133,
      150,
      `
    <text y="120" class="big" text-anchor="middle">${fmt(s.totalContributions)}</text>
    <text y="150" class="label" text-anchor="middle">Total Contributions</text>
    <text y="172" class="muted" text-anchor="middle">${fmtDate(firstDay)} – Present</text>`,
    ),
    col(
      400,
      300,
      `
    <circle cy="105" r="${r}" fill="none" stroke="${theme.track}" stroke-width="6"/>
    <circle cy="105" r="${r}" fill="none" stroke="${theme.flame}" stroke-width="6" stroke-linecap="round"
      transform="rotate(-90 0 105)" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - ringFill)).toFixed(2)}"
      style="--full: ${c.toFixed(2)}; animation: grow 1.2s ease-out forwards"/>
    ${icon("flame", -8, 75, theme.flame, 16)}
    <text y="125" class="big" text-anchor="middle" style="fill: ${theme.flame}">${current.length}</text>
    <text y="172" class="label" text-anchor="middle" style="fill: ${theme.flame}">Current Streak</text>
    <text y="192" class="muted" text-anchor="middle">${fmtRange(current)}</text>`,
    ),
    col(
      667,
      450,
      `
    <text y="120" class="big" text-anchor="middle">${longest.length}</text>
    <text y="150" class="label" text-anchor="middle">Longest Streak</text>
    <text y="172" class="muted" text-anchor="middle">${fmtRange(longest)}</text>`,
    ),
    `  <line x1="267" y1="70" x2="267" y2="190" stroke="${theme.border}"/>`,
    `  <line x1="533" y1="70" x2="533" y2="190" stroke="${theme.border}"/>`,
  ].join("\n");

  return card({ width: 800, height: 215, title: "Contribution Streak", subtitle: "days with at least one contribution", body });
}

function activityCard(s) {
  const weeks = s.lastYear.weeks.map((w) => ({
    contributionDays: w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  }));
  const days = weeks.flatMap((w) => w.contributionDays);
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

  const cell = 10;
  const gap = 3;
  const step = cell + gap;
  const x0 = (800 - weeks.length * step) / 2 + 12;
  const y0 = 82;

  const cells = weeks
    .map((w, wi) =>
      w.contributionDays
        .map((d) => {
          const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
          return `<rect x="${(x0 + wi * step).toFixed(1)}" y="${y0 + wd * step}" width="${cell}" height="${cell}" rx="2" fill="${theme.heat[level(d.count)]}"><title>${d.count} on ${fmtDate(d.date)}</title></rect>`;
        })
        .join(""),
    )
    .map((col, wi) => `  <g class="fade" style="animation-delay: ${wi * 15}ms">${col}</g>`)
    .join("\n");

  // Month labels at the first week that starts in a new month.
  let lastMonth = -1;
  const months = weeks
    .map((w, wi) => {
      const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
      if (m === lastMonth || wi > weeks.length - 2) return "";
      lastMonth = m;
      const name = new Date(Date.UTC(2000, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
      return `<text x="${(x0 + wi * step).toFixed(1)}" y="${y0 - 8}" class="muted" style="font-size: 10px">${name}</text>`;
    })
    .join("");
  const weekdays = [
    [1, "Mon"],
    [3, "Wed"],
    [5, "Fri"],
  ]
    .map(([d, n]) => `<text x="${(x0 - 8).toFixed(1)}" y="${y0 + d * step + 9}" class="muted" text-anchor="end" style="font-size: 10px">${n}</text>`)
    .join("");

  // Summary facts.
  const best = days.reduce((a, b) => (b.count > a.count ? b : a), days[0] || { count: 0, date: "" });
  const byWeekday = Array(7).fill(0);
  for (const d of days) byWeekday[new Date(`${d.date}T00:00:00Z`).getUTCDay()] += d.count;
  const topWd = byWeekday.indexOf(Math.max(...byWeekday));
  const wdName = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][topWd];
  const activeDays = days.filter((d) => d.count > 0).length;
  const facts = [
    best.count ? `Best day: ${best.count} on ${fmtDate(best.date)}` : "Best day: –",
    `Active days: ${activeDays} / ${days.length}`,
    best.count ? `Most active on ${wdName}` : "",
  ]
    .filter(Boolean)
    .join("   ·   ");

  const legendX = 800 - 25 - (5 * step + 70);
  const legend = `<text x="${legendX}" y="${y0 + 7 * step + 32}" class="muted" style="font-size: 10px">Less</text>
  ${theme.heat.map((col, i) => `<rect x="${legendX + 28 + i * step}" y="${y0 + 7 * step + 23}" width="${cell}" height="${cell}" rx="2" fill="${col}"/>`).join("")}
  <text x="${legendX + 32 + 5 * step}" y="${y0 + 7 * step + 32}" class="muted" style="font-size: 10px">More</text>`;

  const updated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  return card({
    width: 800,
    height: 215,
    title: `${fmt(s.lastYear.totalContributions)} contributions in the last year`,
    subtitle: `Updated ${updated}`,
    body: `  ${months}\n  ${weekdays}\n${cells}\n  <text x="25" y="${y0 + 7 * step + 32}" class="muted">${esc(facts)}</text>\n  ${legend}`,
  });
}

// ---------------------------------------------------------------------------
// Tech stack: detected from every repo you own or have committed / opened PRs to.

const DEVICON = "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0/icons";
// Comma-separated tech ids (keys of TECH below) to always show, e.g. tools that can't be detected.
const EXTRA_TECH = (process.env.STATS_EXTRA_TECH || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
// A repo language counts once it makes up at least this share of the repo.
const MIN_LANG_SHARE = 0.08;

const CATEGORIES = ["Languages", "Frontend", "Backend", "Databases", "Data & ML", "Tools & DevOps"];

// id (devicon name) -> [display name, category, devicon variant]
const TECH = {
  html5: ["HTML5", "Languages"],
  css3: ["CSS3", "Languages"],
  javascript: ["JavaScript", "Languages"],
  typescript: ["TypeScript", "Languages"],
  python: ["Python", "Languages"],
  java: ["Java", "Languages"],
  c: ["C", "Languages"],
  cplusplus: ["C++", "Languages"],
  csharp: ["C#", "Languages"],
  go: ["Go", "Languages"],
  rust: ["Rust", "Languages"],
  php: ["PHP", "Languages"],
  ruby: ["Ruby", "Languages"],
  kotlin: ["Kotlin", "Languages"],
  swift: ["Swift", "Languages"],
  dart: ["Dart", "Languages"],
  r: ["R", "Languages"],
  lua: ["Lua", "Languages"],
  bash: ["Shell", "Languages"],
  sass: ["Sass", "Frontend"],
  react: ["React", "Frontend"],
  nextjs: ["Next.js", "Frontend"],
  vuejs: ["Vue.js", "Frontend"],
  nuxtjs: ["Nuxt", "Frontend"],
  svelte: ["Svelte", "Frontend"],
  angular: ["Angular", "Frontend"],
  astro: ["Astro", "Frontend"],
  tailwindcss: ["Tailwind CSS", "Frontend"],
  bootstrap: ["Bootstrap", "Frontend"],
  materialui: ["Material UI", "Frontend"],
  jquery: ["jQuery", "Frontend"],
  redux: ["Redux", "Frontend"],
  threejs: ["Three.js", "Frontend"],
  d3js: ["D3.js", "Frontend"],
  reactnative: ["React Native", "Frontend"],
  flutter: ["Flutter", "Frontend"],
  electron: ["Electron", "Frontend"],
  nodejs: ["Node.js", "Backend"],
  express: ["Express", "Backend"],
  nestjs: ["NestJS", "Backend"],
  django: ["Django", "Backend", "plain"],
  flask: ["Flask", "Backend"],
  fastapi: ["FastAPI", "Backend"],
  spring: ["Spring", "Backend"],
  laravel: ["Laravel", "Backend"],
  dotnetcore: [".NET", "Backend"],
  graphql: ["GraphQL", "Backend", "plain"],
  socketio: ["Socket.IO", "Backend"],
  mongodb: ["MongoDB", "Databases"],
  postgresql: ["PostgreSQL", "Databases"],
  mysql: ["MySQL", "Databases"],
  sqlite: ["SQLite", "Databases"],
  redis: ["Redis", "Databases"],
  firebase: ["Firebase", "Databases"],
  supabase: ["Supabase", "Databases"],
  prisma: ["Prisma", "Databases"],
  sequelize: ["Sequelize", "Databases"],
  sqlalchemy: ["SQLAlchemy", "Databases"],
  jupyter: ["Jupyter", "Data & ML"],
  numpy: ["NumPy", "Data & ML"],
  pandas: ["pandas", "Data & ML"],
  matplotlib: ["Matplotlib", "Data & ML"],
  plotly: ["Plotly", "Data & ML"],
  scikitlearn: ["scikit-learn", "Data & ML"],
  tensorflow: ["TensorFlow", "Data & ML"],
  keras: ["Keras", "Data & ML"],
  pytorch: ["PyTorch", "Data & ML"],
  opencv: ["OpenCV", "Data & ML"],
  streamlit: ["Streamlit", "Data & ML"],
  anaconda: ["Anaconda", "Data & ML"],
  git: ["Git", "Tools & DevOps"],
  github: ["GitHub", "Tools & DevOps"],
  githubactions: ["GitHub Actions", "Tools & DevOps"],
  docker: ["Docker", "Tools & DevOps"],
  kubernetes: ["Kubernetes", "Tools & DevOps"],
  nginx: ["NGINX", "Tools & DevOps"],
  vercel: ["Vercel", "Tools & DevOps"],
  vitejs: ["Vite", "Tools & DevOps"],
  webpack: ["webpack", "Tools & DevOps"],
  jest: ["Jest", "Tools & DevOps", "plain"],
  vitest: ["Vitest", "Tools & DevOps"],
  pytest: ["pytest", "Tools & DevOps"],
  selenium: ["Selenium", "Tools & DevOps"],
  eslint: ["ESLint", "Tools & DevOps"],
  npm: ["npm", "Tools & DevOps"],
  yarn: ["Yarn", "Tools & DevOps"],
  pnpm: ["pnpm", "Tools & DevOps"],
  maven: ["Maven", "Tools & DevOps"],
  gradle: ["Gradle", "Tools & DevOps"],
  linux: ["Linux", "Tools & DevOps"],
  vscode: ["VS Code", "Tools & DevOps"],
  figma: ["Figma", "Tools & DevOps"],
};

// GitHub language name -> tech id
const LANGUAGE_TECH = {
  HTML: "html5", CSS: "css3", SCSS: "sass", Sass: "sass", JavaScript: "javascript", TypeScript: "typescript",
  Python: "python", Java: "java", C: "c", "C++": "cplusplus", "C#": "csharp", Go: "go", Rust: "rust",
  PHP: "php", Ruby: "ruby", Kotlin: "kotlin", Swift: "swift", Dart: "dart", R: "r", Lua: "lua",
  Shell: "bash", Svelte: "svelte", Vue: "vuejs", Astro: "astro", "Jupyter Notebook": "jupyter", Dockerfile: "docker",
};

// npm package -> tech id
const NPM_TECH = {
  react: "react", next: "nextjs", vue: "vuejs", nuxt: "nuxtjs", svelte: "svelte", "@sveltejs/kit": "svelte",
  "@angular/core": "angular", astro: "astro", tailwindcss: "tailwindcss", bootstrap: "bootstrap", sass: "sass",
  "node-sass": "sass", "@mui/material": "materialui", "@material-ui/core": "materialui", jquery: "jquery",
  redux: "redux", "@reduxjs/toolkit": "redux", three: "threejs", d3: "d3js", "react-native": "reactnative",
  electron: "electron", express: "express", "@nestjs/core": "nestjs", graphql: "graphql", "socket.io": "socketio",
  "socket.io-client": "socketio", mongoose: "mongodb", mongodb: "mongodb", pg: "postgresql", mysql: "mysql",
  mysql2: "mysql", sqlite3: "sqlite", "better-sqlite3": "sqlite", redis: "redis", ioredis: "redis",
  firebase: "firebase", "firebase-admin": "firebase", "@supabase/supabase-js": "supabase", prisma: "prisma",
  "@prisma/client": "prisma", sequelize: "sequelize", vite: "vitejs", webpack: "webpack", jest: "jest",
  vitest: "vitest", eslint: "eslint", typescript: "typescript", "selenium-webdriver": "selenium",
};
// npm packages that mean the project runs on a Node.js server.
const NODE_SERVER = ["express", "@nestjs/core", "fastify", "koa", "mongoose", "socket.io", "pg", "mysql2", "prisma"];

// Python package -> tech id
const PY_TECH = {
  django: "django", flask: "flask", fastapi: "fastapi", numpy: "numpy", pandas: "pandas",
  matplotlib: "matplotlib", plotly: "plotly", "scikit-learn": "scikitlearn", sklearn: "scikitlearn",
  tensorflow: "tensorflow", keras: "keras", torch: "pytorch", "opencv-python": "opencv",
  "opencv-python-headless": "opencv", streamlit: "streamlit", sqlalchemy: "sqlalchemy", pytest: "pytest",
  selenium: "selenium", psycopg2: "postgresql", "psycopg2-binary": "postgresql", pymongo: "mongodb",
  redis: "redis", "firebase-admin": "firebase", supabase: "supabase", jupyter: "jupyter", notebook: "jupyter",
};

// Root file name -> tech id
const FILE_TECH = {
  Dockerfile: "docker", "docker-compose.yml": "docker", "docker-compose.yaml": "docker", "compose.yaml": "docker",
  "go.mod": "go", "Cargo.toml": "rust", "pubspec.yaml": "flutter", "pom.xml": "maven", "build.gradle": "gradle",
  "build.gradle.kts": "gradle", "tailwind.config.js": "tailwindcss", "tailwind.config.ts": "tailwindcss",
  "tailwind.config.cjs": "tailwindcss", "vite.config.js": "vitejs", "vite.config.ts": "vitejs",
  "next.config.js": "nextjs", "next.config.mjs": "nextjs", "next.config.ts": "nextjs", "svelte.config.js": "svelte",
  "angular.json": "angular", "astro.config.mjs": "astro", "nuxt.config.ts": "nuxtjs", "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm", "package-lock.json": "npm", "manage.py": "django", "environment.yml": "anaconda",
  "vercel.json": "vercel", "nginx.conf": "nginx", "firebase.json": "firebase", "artisan": "laravel",
};

// Fetch the facts we need about each repo, 10 repos per GraphQL request.
async function fetchRepoDetails(names) {
  const details = [];
  for (let i = 0; i < names.length; i += 10) {
    const batch = names.slice(i, i + 10);
    const fields = batch
      .map((full, j) => {
        const [owner, name] = full.split("/");
        const blob = (alias, path) => `${alias}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } }`;
        return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          nameWithOwner
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { totalSize edges { size node { name } } }
          repositoryTopics(first: 20) { nodes { topic { name } } }
          root: object(expression: "HEAD:") { ... on Tree { entries { name } } }
          workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name } } }
          ${blob("pkg", "package.json")}
          ${blob("req", "requirements.txt")}
          ${blob("pyproject", "pyproject.toml")}
        }`;
      })
      .join("\n");
    const data = await gql(`query { ${fields} }`, {}, { partial: true });
    details.push(...Object.values(data).filter(Boolean));
  }
  return details;
}

function detectRepoTech(repo) {
  const found = new Set();
  const add = (id) => id && TECH[id] && found.add(id);

  const total = repo.languages.totalSize || 1;
  for (const { size, node } of repo.languages.edges) {
    if (size / total >= MIN_LANG_SHARE) add(LANGUAGE_TECH[node.name]);
  }
  for (const { topic } of repo.repositoryTopics.nodes) {
    const t = topic.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    add(TECH[t] ? t : NPM_TECH[topic.name] || PY_TECH[topic.name]);
  }
  for (const { name } of repo.root?.entries || []) add(FILE_TECH[name]);
  if (repo.workflows?.entries?.length) add("githubactions");

  if (repo.pkg?.text) {
    try {
      const pkg = JSON.parse(repo.pkg.text);
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      for (const d of deps) add(NPM_TECH[d]);
      if (deps.some((d) => NODE_SERVER.includes(d))) add("nodejs");
    } catch {
      // Not valid JSON; skip it.
    }
  }
  const pyText = `${repo.req?.text || ""}\n${repo.pyproject?.text || ""}`.toLowerCase();
  if (pyText.trim()) {
    for (const [pkg, id] of Object.entries(PY_TECH)) {
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
      if (new RegExp(`(^|[\\s"'\\[,])${escaped}(?=$|[\\s"'<>=!~;\\[,])`, "m").test(pyText)) add(id);
    }
  }
  return found;
}

async function detectTechStack(stats) {
  const names = [...new Set([...stats.ownedRepos, ...stats.contributedRepos])];
  const repos = await fetchRepoDetails(names);
  const counts = new Map();
  for (const repo of repos) {
    for (const id of detectRepoTech(repo)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const id of EXTRA_TECH) {
    if (!TECH[id]) console.warn(`STATS_EXTRA_TECH: unknown tech "${id}", skipping`);
    else if (!counts.has(id)) counts.set(id, 0);
  }
  const contributedOnly = repos.filter((r) => !stats.ownedRepos.includes(r.nameWithOwner)).length;
  return { counts, repoCount: repos.length, contributedOnly };
}

// Icons are embedded as data URIs, since images inside an <img>-loaded SVG can't load external files.
// Each sits on a light disc so dark logos (Express, Next.js, ...) stay visible on the dark card.
async function loadIcon(id) {
  const variant = TECH[id][2] || "original";
  try {
    const res = await fetch(`${DEVICON}/${id}/${id}-${variant}.svg`);
    if (!res.ok) return null;
    const svg = (await res.text()).replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

async function techStackCard({ counts, repoCount, contributedOnly }) {
  const width = 800;
  const chipH = 30;
  const gap = 8;
  const left = 160;
  const right = width - 25;
  const textWidth = (str, size) => [...str].reduce((w, ch) => w + (/[A-Z]/.test(ch) ? 0.66 : /[a-z0-9]/.test(ch) ? 0.52 : 0.38) * size, 0);

  const icons = new Map(await Promise.all([...counts.keys()].map(async (id) => [id, await loadIcon(id)])));

  let y = 72;
  const sections = [];
  for (const category of CATEGORIES) {
    const items = [...counts.entries()]
      .filter(([id]) => TECH[id][1] === category)
      .sort((a, b) => b[1] - a[1] || TECH[a[0]][0].localeCompare(TECH[b[0]][0]));
    if (!items.length) continue;

    const labelY = y + 19.5;
    let x = left;
    const chips = [];
    for (const [id, count] of items) {
      const name = TECH[id][0];
      const badge = count > 0 ? String(count) : "";
      const badgeW = badge ? textWidth(badge, 10) + 10 : 0;
      const w = Math.round(8 + 22 + 7 + textWidth(name, 12) + (badge ? 7 + badgeW : 0) + 10);
      if (x + w > right && x > left) {
        x = left;
        y += chipH + gap;
      }
      const icon = icons.get(id);
      const iconSvg = icon
        ? `<circle cx="19" cy="15" r="11" fill="${theme.text}"/><image x="11.5" y="7.5" width="15" height="15" href="${icon}"/>`
        : `<circle cx="19" cy="15" r="9" fill="${theme.title2}"/><text x="19" y="19" text-anchor="middle" style="font-size: 11px; font-weight: 700; fill: ${theme.bg2}">${esc(name[0])}</text>`;
      const tip = count > 0 ? `${name}: used in ${count} repo${count === 1 ? "" : "s"}` : name;
      chips.push(`    <g transform="translate(${x}, ${y})"><title>${esc(tip)}</title>
      <rect width="${w}" height="${chipH}" rx="15" fill="#ffffff" fill-opacity="0.05" stroke="${theme.border}"/>
      ${iconSvg}
      <text x="37" y="19.5" class="small">${esc(name)}</text>${
        badge
          ? `
      <rect x="${(w - 10 - badgeW).toFixed(1)}" y="8" width="${badgeW.toFixed(1)}" height="14" rx="7" fill="url(#accent)"/>
      <text x="${(w - 10 - badgeW / 2).toFixed(1)}" y="18.5" text-anchor="middle" style="font-size: 10px; font-weight: 700; fill: ${theme.bg2}">${badge}</text>`
          : ""
      }
    </g>`);
      x += w + gap;
    }
    sections.push(`  <g class="fade" style="animation-delay: ${100 + sections.length * 120}ms">
    <text x="25" y="${labelY}" class="label" style="fill: ${theme.muted}">${esc(category)}</text>
${chips.join("\n")}
  </g>`);
    y += chipH + 16;
  }
  if (!sections.length) {
    sections.push(`  <text x="25" y="90" class="small">No technologies detected yet</text>`);
    y += 40;
  }

  const note = `Scanned ${repoCount} repos (${contributedOnly} of them owned by others) · badge = number of repos using it`;
  return card({
    width,
    height: y + 30,
    title: "Tech Stack",
    subtitle: "auto-detected from my projects & contributions",
    body: `${sections.join("\n")}\n  <text x="25" y="${y + 10}" class="muted" style="font-size: 11px">${esc(note)}</text>`,
  });
}

const stats = await fetchStats();
await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/stats.svg`, statsCard(stats));
await writeFile(`${OUT_DIR}/top-langs.svg`, langsCard(stats.langs));
await writeFile(`${OUT_DIR}/streak.svg`, streakCard(stats));
await writeFile(`${OUT_DIR}/activity.svg`, activityCard(stats));
const tech = await detectTechStack(stats);
await writeFile(`${OUT_DIR}/tech-stack.svg`, await techStackCard(tech));
console.log(`Generated cards for ${USERNAME}:`, {
  ...stats,
  allDays: stats.allDays.length,
  lastYear: stats.lastYear.totalContributions,
  langs: stats.langs.length,
  ownedRepos: stats.ownedRepos.length,
  contributedRepos: stats.contributedRepos.length,
  tech: Object.fromEntries(tech.counts),
});
