// Generates self-hosted GitHub stats cards (SVG) into ./profile.
// No dependencies: runs on Node 20+ with the built-in fetch.
import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.env.STATS_USERNAME || "Chief-spartan-117";
const TOKEN = process.env.GH_TOKEN;
const OUT_DIR = process.env.STATS_OUT_DIR || "profile";
const LANGS_COUNT = 6;

if (!TOKEN) throw new Error("GH_TOKEN is not set");

// Dracula theme
const theme = {
  bg: "#282a36",
  border: "#6272a4",
  title: "#ff6e96",
  text: "#f8f8f2",
  icon: "#79dafa",
};

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

async function fetchStats() {
  const base = await gql(
    `query($login: String!) {
      user(login: $login) {
        name
        followers { totalCount }
        pullRequests { totalCount }
        issues { totalCount }
        contributionsCollection { contributionYears }
      }
    }`,
    { login: USERNAME },
  );
  const user = base.user;

  // Sum commits over every contribution year (all-time commits).
  let commits = 0;
  for (const year of user.contributionsCollection.contributionYears) {
    const data = await gql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
          }
        }
      }`,
      { login: USERNAME, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    );
    const c = data.user.contributionsCollection;
    commits += c.totalCommitContributions + c.restrictedContributionsCount;
  }

  // Walk all owned, non-fork repositories for stars and languages.
  let stars = 0;
  const langs = new Map();
  let cursor = null;
  do {
    const data = await gql(
      `query($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
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
      for (const { size, node } of repo.languages.edges) {
        const prev = langs.get(node.name) || { size: 0, color: node.color || "#858585" };
        prev.size += size;
        langs.set(node.name, prev);
      }
    }
    cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
  } while (cursor);

  return {
    name: user.name || USERNAME,
    stars,
    commits,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    followers: user.followers.totalCount,
    langs: [...langs.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.size - a.size),
  };
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function card({ width, height, title, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.title}; }
    .label { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .value { font: 700 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
    .small { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${theme.text}; }
  </style>
  <rect x="0.5" y="0.5" rx="4.5" width="${width - 1}" height="${height - 1}" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="25" y="35" class="title">${esc(title)}</text>
${body}
</svg>
`;
}

function statsCard(s) {
  const rows = [
    ["Total Stars Earned", s.stars],
    ["Total Commits", s.commits],
    ["Total PRs", s.prs],
    ["Total Issues", s.issues],
    ["Followers", s.followers],
  ];
  const body = rows
    .map(
      ([label, value], i) => `  <g transform="translate(25, ${70 + i * 25})">
    <circle cx="5" cy="-5" r="5" fill="${theme.icon}"/>
    <text x="20" y="0" class="label">${label}:</text>
    <text x="300" y="0" class="value" text-anchor="end">${fmt(value)}</text>
  </g>`,
    )
    .join("\n");
  return card({ width: 350, height: 70 + rows.length * 25 + 10, title: "My Github Stats", body });
}

function langsCard(langs) {
  const top = langs.slice(0, LANGS_COUNT);
  const total = top.reduce((sum, l) => sum + l.size, 0) || 1;
  const barWidth = 300;
  let x = 0;
  const bar = top
    .map((l) => {
      const w = (l.size / total) * barWidth;
      const rect = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
      x += w;
      return rect;
    })
    .join("");
  const items = top
    .map((l, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pct = ((l.size / total) * 100).toFixed(2);
      return `  <g transform="translate(${25 + col * 150}, ${85 + row * 25})">
    <circle cx="5" cy="-4" r="5" fill="${l.color}"/>
    <text x="15" y="0" class="small">${esc(l.name)} ${pct}%</text>
  </g>`;
    })
    .join("\n");
  const body = `  <mask id="bar"><rect x="0" y="0" width="${barWidth}" height="8" rx="4" fill="#fff"/></mask>
  <g mask="url(#bar)" transform="translate(25, 52)">${bar}</g>
${items || '  <text x="25" y="90" class="small">No language data yet</text>'}`;
  const rows = Math.max(1, Math.ceil(top.length / 2));
  return card({ width: 350, height: 85 + rows * 25, title: "Most Used Languages", body });
}

const stats = await fetchStats();
await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/stats.svg`, statsCard(stats));
await writeFile(`${OUT_DIR}/top-langs.svg`, langsCard(stats.langs));
console.log(`Generated cards for ${USERNAME}:`, { ...stats, langs: stats.langs.length });
